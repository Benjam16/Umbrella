export type RunMode = "cloud" | "remote";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "ejected"
  | "canceled";

export type RiskLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type BlueprintInputField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "url" | "textarea";
  helper?: string;
};

export type PlannedNode = {
  id: string;
  label: string;
  worker: "supervisor" | "scraper" | "coder" | "auditor" | "writer";
  risk: RiskLevel;
  requires?: Array<"local_fs" | "shell" | "secrets">;
  /** IDs of parents in the DAG. */
  deps: string[];
};

export type Blueprint = {
  id: string;
  title: string;
  tagline: string;
  /** Short marketing blurb shown in the gallery. */
  description: string;
  /** One line shown next to the "Try Now" card. */
  sampleGoal: string;
  estimatedSeconds: number;
  inputs: BlueprintInputField[];
  /** Highest risk this blueprint can encounter. Used to decide eject affordance. */
  maxRisk: RiskLevel;
  /** Produces the DAG for a given set of inputs. */
  plan: (inputs: Record<string, string>) => PlannedNode[];
};

export type RunEventKind =
  | "plan"
  | "node.start"
  | "node.log"
  | "node.finish"
  | "artifact"
  | "eject.requested"
  | "signature.requested"
  | "run.note"
  | "run.finish"
  | "run.error"
  /**
   * Emitted by the RelayerService after a mission has been anchored to the
   * Base blockchain. Payload mirrors `OnchainAnchor`. The /app/runs/:id UI
   * renders the BaseScan link from this event.
   */
  | "run.onchain";

/**
 * The ProofOfSuccess payload the RelayerService signs before calling
 * UmbrellaAgentToken.recordSuccess(). Shape is versioned so the relayer and
 * any future TEE attester can agree without coupling deployments.
 */
export type ProofOfSuccess = {
  version: 1;
  runId: string;
  blueprintId: string;
  ownerFingerprint: string | null;
  /** 0 – 10_000. 10000 means "every node succeeded, audit score >= 90". */
  successScore: number;
  /** USD value produced by the mission, in integer cents. */
  revenueCents: number;
  /** Number of nodes executed (proxy for "task complexity"). */
  nodesExecuted: number;
  /** ms the run spent between startedAt and finishedAt. */
  durationMs: number;
  /** Final run status at time of attestation. */
  status: "succeeded" | "failed";
  /** Epoch ms of the moment the proof was minted. */
  mintedAt: number;
};

/**
 * Result of anchoring a proof on-chain. Persisted per-run so the UI can show
 * a BaseScan link and so the relayer can answer "is this run anchored yet?"
 * without re-scanning the contract.
 */
export type OnchainAnchor = {
  runId: string;
  /** Address of the `UmbrellaAgentToken` that was updated. */
  tokenAddress: string;
  /** EIP-155 chain id. Base mainnet = 8453, Base Sepolia = 84532. */
  chainId: number;
  /** 0x… tx hash from `recordSuccess`. */
  txHash: string;
  /** Address that signed the proof (the relayer or TEE attester). */
  attester: string;
  /** Signature over keccak256(abi.encode(proof)). */
  signature: string;
  /** Whether the CDP paymaster sponsored the gas. */
  paymasterSponsored: boolean;
  /** Copy of the signed proof so anyone can verify without re-querying. */
  proof: ProofOfSuccess;
  /** ISO timestamp the anchor row was written. */
  anchoredAt: string;
};

export type RunEvent = {
  seq: number;
  kind: RunEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type RunRecord = {
  id: string;
  blueprintId: string;
  goal: string;
  mode: RunMode;
  status: RunStatus;
  riskThreshold: number;
  inputs: Record<string, string>;
  summary?: string | null;
  error?: string | null;
  ownerFingerprint?: string | null;
  nodeId?: string | null;
  /** Human-readable node id (e.g. `node-abc1`) this run was dispatched to. */
  targetNodeId?: string | null;
  dispatchedAt?: string | null;
  claimedAt?: string | null;
  shareToken?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type ToolName =
  | "http.fetch"
  | "parse.html"
  | "parse.json"
  | "summarize"
  | "score";

export type ToolCall = {
  tool: ToolName;
  input: Record<string, unknown>;
};

export type ToolResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
};
