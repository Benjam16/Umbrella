import { createHmac } from "crypto";
import { createPublicClient, http, parseEther, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getServerSupabase } from "@umbrella/runner/supabase";

export type GeneratedHookRow = {
  id: string;
  wallet_address: string;
  tx_hash: string;
  chain_id: number;
  prompt: string | null;
  solidity_code: string;
  model: string;
  status: string;
  is_public: boolean;
  /** Hook id this row was forked from, if any (see migration 0003). */
  forked_from: string | null;
  token_address: string | null;
  pool_address: string | null;
  hook_address: string | null;
  /** Pump.fun-style bonding curve address (migration 0008). */
  curve_address?: string | null;
  /** pending | deploying | active | graduated | failed. */
  curve_stage?: string | null;
  /** Set when the mission record contract is verified on Basescan. */
  verified_at?: string | null;
  /** Populated when any deploy step fails; surfaced in LaunchStatusPanel. */
  deploy_error?: string | null;
  /** keccak256 of the Kimi Solidity output. */
  mission_code_hash?: string | null;
  /** Supabase storage path pointing at the full Kimi source. */
  metadata_uri?: string | null;
  created_at: string;
};

type PaymentVerification = {
  txHash: Hex;
  from: Address;
  to: Address;
  value: bigint;
};

function webhookSigningKey(): string | null {
  return process.env.ALCHEMY_WEBHOOK_SIGNING_KEY?.trim() || null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a.replace(/^0x/, ""), "hex");
  const bb = Buffer.from(b.replace(/^0x/, ""), "hex");
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i]! ^ bb[i]!;
  return diff === 0;
}

export function verifyAlchemySignature(rawBody: string, signature: string | null): boolean {
  const key = webhookSigningKey();
  if (!key) return true;
  if (!signature) return false;
  const digest = createHmac("sha256", key).update(rawBody).digest("hex");
  const normalized = signature.replace(/^sha256=/i, "");
  return timingSafeEqualHex(digest, normalized);
}

function asHexHash(v: unknown): Hex | null {
  if (typeof v !== "string") return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) return null;
  return v as Hex;
}

function extractTxHash(payload: unknown): Hex | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct = asHexHash(p.hash) || asHexHash(p.transactionHash) || asHexHash(p.txHash);
  if (direct) return direct;

  const event = p.event as Record<string, unknown> | undefined;
  const fromEvent = event
    ? asHexHash(event.hash) || asHexHash(event.transactionHash) || asHexHash(event.txHash)
    : null;
  if (fromEvent) return fromEvent;

  const activity = Array.isArray(p.activity) ? p.activity[0] : null;
  if (activity && typeof activity === "object") {
    const a = activity as Record<string, unknown>;
    const fromActivity = asHexHash(a.hash) || asHexHash(a.transactionHash);
    if (fromActivity) return fromActivity;
  }
  return null;
}

export async function verifyPaymentFromWebhook(
  payload: unknown,
  opts?: { chainId?: number },
): Promise<PaymentVerification> {
  const txHash = extractTxHash(payload);
  if (!txHash) throw new Error("webhook payload missing tx hash");

  const defaultForgeChainId = Number(process.env.UMBRELLA_FORGE_CHAIN_ID?.trim() ?? "84532");
  const chainId = opts?.chainId ?? defaultForgeChainId;
  const isSepolia = chainId === 84532;
  if (!isSepolia && chainId !== 8453) {
    throw new Error(`unsupported forge chain ${chainId}`);
  }
  const chain = isSepolia ? baseSepolia : base;
  const rpcCandidates = buildRpcCandidates({ isSepolia });
  if (rpcCandidates.length === 0) {
    throw new Error(
      isSepolia
        ? "BASE_SEPOLIA_RPC_URL is required (or use a valid public Base Sepolia RPC)"
        : "BASE_RPC_URL is required",
    );
  }
  const treasury = (
    (isSepolia ? process.env.TREASURY_ADDRESS_SEPOLIA : undefined) ??
    process.env.TREASURY_ADDRESS
  )?.toLowerCase();
  if (!treasury) throw new Error("TREASURY_ADDRESS is required");
  const minWei = BigInt(
    (
      (isSepolia ? process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI_SEPOLIA : undefined) ??
      process.env.UMBRELLA_FORGE_MIN_PAYMENT_WEI ??
      parseEther("0.0011").toString()
    ).trim(),
  );

  const { tx, receipt } = await fetchTxWithRpcFailover({
    chain,
    txHash,
    rpcCandidates,
  });
  if (receipt.status !== "success") throw new Error("payment transaction reverted");
  if (!tx.to) throw new Error("payment transaction has no recipient");
  if (tx.to.toLowerCase() !== treasury) throw new Error("payment not sent to configured treasury");
  if (tx.value < minWei) throw new Error("payment below minimum required amount");

  return {
    txHash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
  };
}

function buildRpcCandidates(args: { isSepolia: boolean }): string[] {
  const raw = args.isSepolia
    ? [
        process.env.BASE_SEPOLIA_RPC_URL,
        process.env.BASE_RPC_URL,
        // Safe public fallback if a custom provider URL is malformed.
        "https://sepolia.base.org",
      ]
    : [process.env.BASE_RPC_URL, "https://mainnet.base.org"];
  return raw
    .map((v) => v?.trim() ?? "")
    .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx);
}

async function fetchTxWithRpcFailover(args: {
  chain: typeof base | typeof baseSepolia;
  txHash: Hex;
  rpcCandidates: string[];
}): Promise<{
  tx: { from: Address; to: Address | null; value: bigint };
  receipt: { status: string };
}> {
  const errors: string[] = [];
  for (const rpcUrl of args.rpcCandidates) {
    try {
      const client = createPublicClient({ chain: args.chain, transport: http(rpcUrl) });
      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash: args.txHash }),
        client.getTransactionReceipt({ hash: args.txHash }),
      ]);
      return {
        tx: {
          from: tx.from,
          to: tx.to,
          value: tx.value,
        },
        receipt: {
          status: String(receipt.status),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "rpc request failed";
      errors.push(`${rpcUrl} => ${msg.slice(0, 180)}`);
    }
  }
  throw new Error(
    `payment verification RPC failed across all endpoints. Check BASE RPC env. ${errors[0] ?? ""}`,
  );
}

export async function generateHookWithKimi(prompt: string): Promise<{ code: string; model: string }> {
  const baseUrl = (
    process.env.KIMI_BASE_URL ??
    process.env.UMBRELLA_INFERENCE_URL ??
    "https://api.moonshot.cn/v1"
  ).replace(/\/$/, "");
  const model = process.env.KIMI_MODEL?.trim() || "kimi-k2.5";
  const apiKey = process.env.KIMI_API_KEY?.trim();
  const allowFallback = (process.env.UMBRELLA_FORGE_ALLOW_TEMPLATE_FALLBACK?.trim() ?? "true")
    .toLowerCase() !== "false";

  if (!apiKey) {
    if (!allowFallback) throw new Error("KIMI_API_KEY is required");
    return {
      code: templateFallbackHook(prompt),
      model: "template-fallback:no-kimi-key",
    };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You write production-ready Uniswap v4 Solidity hooks. Return only Solidity source code.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    const authFailure =
      res.status === 401 ||
      /invalid[_\s-]?authentication|unauthorized|invalid api key/i.test(raw);
    if (authFailure && allowFallback) {
      return {
        code: templateFallbackHook(prompt),
        model: `template-fallback:kimi-auth-${res.status}`,
      };
    }
    throw new Error(`kimi request failed: ${res.status} ${raw.slice(0, 200)}`);
  }
  const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  const code = json.choices?.[0]?.message?.content?.trim() || "";
  if (!code) throw new Error("kimi returned empty code");
  return { code, model };
}

function templateFallbackHook(prompt: string): string {
  const promptHash = createHmac("sha256", "umbrella-template-fallback")
    .update(prompt)
    .digest("hex")
    .slice(0, 12);
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Umbrella fallback hook template.
 * Used when remote model auth is unavailable so forge can still complete.
 */
contract UmbrellaGeneratedHook_${promptHash} {
    string public missionHash = "${promptHash}";
    string public metadata = "Generated via template fallback";

    event MissionExecuted(address indexed caller, bytes data);

    function execute(bytes calldata data) external returns (bool) {
        emit MissionExecuted(msg.sender, data);
        return true;
    }
}
`;
}

export async function insertGeneratedHook(row: {
  walletAddress: string;
  txHash: string;
  chainId?: number;
  prompt?: string;
  solidityCode: string;
  model: string;
  /**
   * Optional parent hook id. When set, this row is counted toward the
   * parent's "forks" total and can be traced back via the lineage graph.
   */
  forkedFrom?: string | null;
  tokenAddress?: string | null;
  poolAddress?: string | null;
  hookAddress?: string | null;
}): Promise<GeneratedHookRow> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("supabase not configured");

  const payload = {
    wallet_address: row.walletAddress.toLowerCase(),
    tx_hash: row.txHash.toLowerCase(),
    chain_id: row.chainId ?? 8453,
    prompt: row.prompt ?? null,
    solidity_code: row.solidityCode,
    model: row.model,
    status: "completed",
    forked_from: row.forkedFrom ?? null,
    token_address: row.tokenAddress ?? null,
    pool_address: row.poolAddress ?? null,
    hook_address: row.hookAddress ?? null,
  };

  const { data, error } = await supabase
    .from("generated_hooks")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "failed to insert generated hook");
  return data as GeneratedHookRow;
}

export async function listGeneratedHooks(walletAddress: string, limit = 20): Promise<GeneratedHookRow[]> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { data, error } = await supabase
    .from("generated_hooks")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as GeneratedHookRow[];
}

/**
 * Flip the `is_public` flag on a generated hook. The wallet must match the
 * row owner — this is a pre-auth safeguard until we wire signed sessions.
 *
 * Returns the updated row so clients can echo the new state back into their
 * workspace cache without re-fetching.
 */
export async function setHookPublic(opts: {
  hookId: string;
  walletAddress: string;
  isPublic: boolean;
}): Promise<GeneratedHookRow> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const wallet = opts.walletAddress.toLowerCase();

  const { data: existing, error: readError } = await supabase
    .from("generated_hooks")
    .select("*")
    .eq("id", opts.hookId)
    .single();
  if (readError || !existing) throw new Error(readError?.message ?? "hook not found");
  if ((existing as GeneratedHookRow).wallet_address.toLowerCase() !== wallet) {
    throw new Error("wallet does not own this hook");
  }

  const { data, error } = await supabase
    .from("generated_hooks")
    .update({ is_public: opts.isPublic })
    .eq("id", opts.hookId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "failed to update visibility");
  return data as GeneratedHookRow;
}

/**
 * Marketplace-facing feed: only rows the creator has opted to broadcast.
 * Deliberately small payload — the full Solidity source is intentionally
 * excluded so clients don't scrape bytecode from the public endpoint.
 */
/**
 * Fetch a single public generated hook by id. Returns `null` when the row
 * does not exist or is not public. Mirrors {@link listPublicHooks} in that
 * Solidity source and sensitive fields are intentionally not returned.
 */
export async function getPublicHookById(
  id: string,
): Promise<Pick<
  GeneratedHookRow,
  | "id"
  | "wallet_address"
  | "model"
  | "prompt"
  | "created_at"
  | "token_address"
  | "pool_address"
  | "hook_address"
> | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("generated_hooks")
    .select(
      "id, wallet_address, model, prompt, created_at, token_address, pool_address, hook_address",
    )
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Pick<
    GeneratedHookRow,
    | "id"
    | "wallet_address"
    | "model"
    | "prompt"
    | "created_at"
    | "token_address"
    | "pool_address"
    | "hook_address"
  > | null;
}

export type PublicHookListing = Pick<
  GeneratedHookRow,
  | "id"
  | "wallet_address"
  | "model"
  | "prompt"
  | "created_at"
  | "token_address"
  | "pool_address"
  | "hook_address"
  | "chain_id"
  | "curve_address"
  | "curve_stage"
  | "verified_at"
  | "deploy_error"
>;

export async function listPublicHooks(limit = 50): Promise<PublicHookListing[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("generated_hooks")
    .select(
      "id, wallet_address, model, prompt, created_at, chain_id, token_address, pool_address, hook_address, curve_address, curve_stage, verified_at, deploy_error",
    )
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicHookListing[];
}

/**
 * Number of rows whose `forked_from` references the given hook id. Used by
 * the creator workspace card + marketplace to show reuse signal.
 *
 * Returns 0 when Supabase is not configured so the UI can always render.
 */
export async function countForks(hookId: string): Promise<number> {
  const supabase = getServerSupabase();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("generated_hooks")
    .select("id", { count: "exact", head: true })
    .eq("forked_from", hookId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Batched version — looks up fork counts for many parent hook ids in a
 * single round-trip so the marketplace feed doesn't fan out into N queries.
 */
export async function countForksForMany(
  hookIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of hookIds) out[id] = 0;
  if (hookIds.length === 0) return out;
  const supabase = getServerSupabase();
  if (!supabase) return out;

  const { data, error } = await supabase
    .from("generated_hooks")
    .select("forked_from")
    .in("forked_from", hookIds);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<{ forked_from: string | null }>) {
    if (row.forked_from && row.forked_from in out) out[row.forked_from] += 1;
  }
  return out;
}

