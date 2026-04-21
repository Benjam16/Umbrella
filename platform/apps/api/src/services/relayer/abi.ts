/**
 * ABI for the Umbrella on-chain surface the relayer actually calls.
 *
 * Kept as a plain JS array (not parseAbi) because viem's `signTypedData` and
 * `simulateContract` need the full tuple component layout for the MissionProof
 * struct. If we used parseAbi, TypeScript wouldn't know the field order inside
 * the struct and we'd lose the compile-time guarantee that off-chain and
 * on-chain encode the same way.
 *
 * Source of truth:
 *   platform/contracts/src/UmbrellaAgentToken.sol
 *   platform/contracts/src/libraries/MissionProofLib.sol
 */
export const agentTokenAbi = [
  {
    type: "function",
    name: "recordSuccess",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "proof",
        type: "tuple",
        internalType: "struct MissionProofLib.MissionProof",
        components: [
          { name: "version", type: "uint8" },
          { name: "runIdHash", type: "bytes32" },
          { name: "blueprintIdHash", type: "bytes32" },
          { name: "ownerHash", type: "bytes32" },
          { name: "successScore", type: "uint32" },
          { name: "revenueCents", type: "uint64" },
          { name: "nodesExecuted", type: "uint16" },
          { name: "durationSeconds", type: "uint32" },
          { name: "status", type: "uint8" },
          { name: "mintedAt", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "successRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "domainSeparatorV4",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "event",
    name: "MissionSuccess",
    inputs: [
      { name: "digest", type: "bytes32", indexed: true },
      { name: "runIdHash", type: "bytes32", indexed: true },
      { name: "successScore", type: "uint32", indexed: false },
      { name: "revenueCents", type: "uint64", indexed: false },
      { name: "nodesExecuted", type: "uint16", indexed: false },
    ],
  },
] as const;

export const factoryAbi = [
  {
    type: "function",
    name: "tokenFor",
    stateMutability: "view",
    inputs: [{ name: "blueprintId", type: "string" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createAgentToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "blueprintId", type: "string" },
      { name: "initialSupply", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "AgentTokenCreated",
    inputs: [
      { name: "blueprintIdIndexed", type: "string", indexed: true },
      { name: "blueprintId", type: "string", indexed: false },
      { name: "token", type: "address", indexed: true },
      { name: "deployer", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "attester", type: "address", indexed: false },
      { name: "initialSupply", type: "uint256", indexed: false },
    ],
  },
] as const;
