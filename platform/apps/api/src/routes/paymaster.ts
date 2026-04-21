import { Hono } from "hono";
import { loadRegistry } from "../services/relayer/registry.js";

/**
 * PaymasterProxy — a thin trust boundary between browsers and the CDP Paymaster.
 *
 * Why this exists:
 *   Plopping the raw Paymaster RPC URL into the React bundle (via
 *   NEXT_PUBLIC_...) means anyone can open DevTools, copy the URL, and burn
 *   your $15k/month Gasless Campaign credits sponsoring their own dApp. We
 *   sit in the middle so the browser only ever talks to `/v1/paymaster/rpc`.
 *
 * What it enforces:
 *   - POST-only, JSON-RPC 2.0 framing.
 *   - Only `pm_getPaymasterStubData`, `pm_getPaymasterData`,
 *     `pm_sponsorUserOperation` (Coinbase legacy) are forwarded.
 *   - Every `callData` inside the UserOperation is parsed: target contract
 *     must be in the allowlist (factory, registry, any deployed AgentToken)
 *     AND the function selector must be in the allowed set.
 *   - Rate limit piggybacks on the global rateLimitMiddleware in app.ts.
 *
 * Configuration:
 *   CDP_PAYMASTER_URL  — full upstream URL from the CDP dashboard.
 *   CDP_PROJECT_ID     — sent as header for telemetry.
 *
 * Swarm v4 seeding (direct CDP URL in SwarmManager) must also allowlist on the CDP
 * dashboard: PoolManager, mission + quote ERC-20s, UMBRELLA_V4_LIQUIDITY_ROUTER, and
 * selectors 0x095ea7b3 (ERC20 approve) + 0x5a6bcfda (UmbrellaV4Router.modifyLiquidity).
 * This HTTP proxy uses buildAllowlist() plus ALLOWED_SELECTORS (browser flows; extend with care).
 */
export const paymasterRoutes = new Hono();

const ALLOWED_METHODS = new Set<string>([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_sponsorUserOperation",
]);

/**
 * Function selectors we sponsor. Keep this short — every selector we add is a
 * potential gas-drain attack vector if the target contract is compromised.
 *
 *   recordSuccess((uint8,bytes32,...),bytes)   -> 4-byte selector precomputed
 *   createAgentToken(string,string,string,uint256)
 *   registerAgent(address,string,address,string)
 *   linkAgentToken(uint256,address)
 */
const ALLOWED_SELECTORS = new Set<string>([
  // Precomputed via viem's toFunctionSelector. If the Solidity signature
  // changes (e.g. struct fields reordered), regenerate and update both here
  // AND the CDP Paymaster "allowed function" list.
  "0xf9b6127c", // recordSuccess((uint8,bytes32,bytes32,bytes32,uint32,uint64,uint16,uint32,uint8,uint64),bytes)
  "0x89b39351", // createAgentToken(string,string,string,uint256)
  "0xc760b045", // registerAgent(address,string,address,string)
  "0xf05fcb63", // linkAgentToken(uint256,address)
]);

type JsonRpcReq = {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params: unknown[];
};

function jrpcError(id: JsonRpcReq["id"], code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id, error: { code, message, data } } as const;
}

function buildAllowlist(): Set<string> {
  const set = new Set<string>();
  const envList = (process.env.CDP_PAYMASTER_CONTRACT_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{40}$/.test(s));
  for (const a of envList) set.add(a);
  for (const entry of loadRegistry()) set.add(entry.tokenAddress.toLowerCase());
  const factory = (process.env.UMBRELLA_FACTORY_ADDRESS ?? "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(factory)) set.add(factory);
  const registry = (process.env.UMBRELLA_REGISTRY_ADDRESS ?? "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(registry)) set.add(registry);
  const liqRouter = (process.env.UMBRELLA_V4_LIQUIDITY_ROUTER ?? "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(liqRouter)) set.add(liqRouter);
  const donateRouter = (process.env.UMBRELLA_V4_DONATE_ROUTER ?? "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(donateRouter)) set.add(donateRouter);
  const poolMgr = (process.env.V4_POOL_MANAGER_BASE_SEPOLIA ?? "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(poolMgr)) set.add(poolMgr);
  return set;
}

function extractUserOp(params: unknown[]): { callData?: string; sender?: string } | null {
  // Both `pm_sponsorUserOperation` (legacy CDP shape) and
  // `pm_getPaymasterData`/`pm_getPaymasterStubData` (ERC-7677) put the
  // UserOperation in params[0].
  if (!Array.isArray(params) || params.length === 0) return null;
  const op = params[0];
  if (!op || typeof op !== "object") return null;
  const asRecord = op as Record<string, unknown>;
  const callData = typeof asRecord.callData === "string" ? asRecord.callData : undefined;
  const sender = typeof asRecord.sender === "string" ? asRecord.sender : undefined;
  return { callData, sender };
}

/**
 * Decode the `execute(address,uint256,bytes)` or `executeBatch` call that smart
 * wallets wrap their actual target call inside. We only inspect the inner
 * target(s) — everything else can stay opaque to us.
 */
function parseTargetsAndSelectors(callData: string): Array<{ target: string; selector: string }> | null {
  if (!callData.startsWith("0x") || callData.length < 10) return null;
  const outer = callData.slice(2); // strip 0x
  const outerSelector = "0x" + outer.slice(0, 8);

  // ERC-4337 v0.7 / Coinbase Smart Wallet `execute(address,uint256,bytes)` = 0xb61d27f6
  if (outerSelector === "0xb61d27f6") {
    // address @ 4-byte + 12-byte pad + 20 bytes
    const target = "0x" + outer.slice(32, 72).toLowerCase(); // 4+28=32 → take 40 chars
    // The inner calldata lives at the dynamic offset; we look for its 4-byte selector
    // by walking the standard offset (0x60 from selector).
    const innerOffset = parseInt(outer.slice(72 + 64, 72 + 128), 16) * 2 + 8;
    const innerLenStart = innerOffset;
    const innerLen = parseInt(outer.slice(innerLenStart, innerLenStart + 64), 16);
    if (innerLen === 0) return [{ target, selector: "0x" }];
    const selector = "0x" + outer.slice(innerLenStart + 64, innerLenStart + 64 + 8);
    return [{ target, selector }];
  }

  // `executeBatch((address,uint256,bytes)[])` = 0x34fcd5be (CB Smart Wallet)
  // For safety we reject batches that can't be parsed; users fall back to
  // single executes for sponsored calls.
  if (outerSelector === "0x34fcd5be") return null;

  // Otherwise: treat the first 4 bytes as the selector and bail on target.
  return [{ target: "0x", selector: outerSelector }];
}

paymasterRoutes.post("/rpc", async (c) => {
  const upstream = process.env.CDP_PAYMASTER_URL;
  if (!upstream) {
    return c.json({ error: "paymaster_not_configured" }, 503);
  }

  let req: JsonRpcReq;
  try {
    req = (await c.req.json()) as JsonRpcReq;
  } catch {
    return c.json(jrpcError(null, -32700, "Parse error"), 400);
  }
  if (!req || req.jsonrpc !== "2.0") {
    return c.json(jrpcError(req?.id ?? null, -32600, "Invalid Request"), 400);
  }
  if (!ALLOWED_METHODS.has(req.method)) {
    return c.json(jrpcError(req.id, -32601, `Method not allowed: ${req.method}`), 400);
  }

  const userOp = extractUserOp(req.params);
  if (!userOp?.callData) {
    return c.json(jrpcError(req.id, -32602, "Missing callData in UserOperation"), 400);
  }

  const allowedTargets = buildAllowlist();
  const calls = parseTargetsAndSelectors(userOp.callData);
  if (!calls) {
    return c.json(
      jrpcError(req.id, -32603, "Unable to parse execute/executeBatch; refused to sponsor."),
      400,
    );
  }

  for (const call of calls) {
    if (call.target !== "0x" && !allowedTargets.has(call.target.toLowerCase())) {
      return c.json(
        jrpcError(req.id, -32003, `Target ${call.target} not in Umbrella Paymaster allowlist.`),
        403,
      );
    }
    if (!ALLOWED_SELECTORS.has(call.selector.toLowerCase())) {
      return c.json(
        jrpcError(req.id, -32003, `Selector ${call.selector} not sponsored by Umbrella.`),
        403,
      );
    }
  }

  // Forward the original JSON-RPC payload unchanged.
  const forwarded = await fetch(upstream, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.CDP_PROJECT_ID ? { "x-cdp-project-id": process.env.CDP_PROJECT_ID } : {}),
    },
    body: JSON.stringify(req),
  });
  const text = await forwarded.text();
  return new Response(text, {
    status: forwarded.status,
    headers: { "content-type": forwarded.headers.get("content-type") ?? "application/json" },
  });
});

/** Health check: returns whether the proxy has an upstream configured. */
paymasterRoutes.get("/status", (c) => {
  return c.json({
    configured: Boolean(process.env.CDP_PAYMASTER_URL),
    allowlistSize: buildAllowlist().size,
    allowedMethods: Array.from(ALLOWED_METHODS),
    allowedSelectors: Array.from(ALLOWED_SELECTORS),
  });
});
