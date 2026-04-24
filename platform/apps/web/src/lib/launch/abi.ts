/**
 * Hand-maintained ABI fragments for the launch pipeline. Mirrors the
 * relayer's {@link ../../../../api/src/services/relayer/abi.ts} style so both
 * services agree on the exact field order of events + function inputs.
 *
 * Contract sources of truth:
 *   platform/contracts/src/UmbrellaAgentTokenFactory.sol
 *   platform/contracts/src/UmbrellaCurveFactory.sol
 *   platform/contracts/src/UmbrellaBondingCurve.sol
 *   platform/contracts/src/UmbrellaAgentMissionRecord.sol
 */

export const agentTokenFactoryAbi = [
  {
    type: "function",
    name: "launchFeeWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "defaultAttester",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createAgentToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "blueprintId", type: "string" },
      { name: "initialSupply", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "predictTokenAddress",
    stateMutability: "view",
    inputs: [
      { name: "name_", type: "string" },
      { name: "symbol_", type: "string" },
      { name: "blueprintId_", type: "string" },
      { name: "attester_", type: "address" },
      { name: "owner_", type: "address" },
      { name: "initialSupply", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenFor",
    stateMutability: "view",
    inputs: [{ name: "blueprintId", type: "string" }],
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

export const curveFactoryAbi = [
  {
    type: "function",
    name: "createCurveWithPermit",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "creator", type: "address" },
      { name: "hookAddress", type: "address" },
      { name: "tokensSeed", type: "uint256" },
      { name: "permitDeadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "curveFor",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "graduationThresholdWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "CurveCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "hookAddress", type: "address", indexed: false },
      { name: "tokensSeeded", type: "uint256", indexed: false },
    ],
  },
] as const;

export const bondingCurveAbi = [
  {
    type: "function",
    name: "tokensAvailable",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokensSold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ethReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationThresholdWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "spotPriceWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "previewBuyFromEth",
    stateMutability: "view",
    inputs: [{ name: "ethInGross", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteBuy",
    stateMutability: "view",
    inputs: [{ name: "deltaTokens", type: "uint256" }],
    outputs: [
      { name: "ethInNet", type: "uint256" },
      { name: "ethInGross", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteSell",
    stateMutability: "view",
    inputs: [{ name: "deltaTokens", type: "uint256" }],
    outputs: [
      { name: "ethOutNet", type: "uint256" },
      { name: "ethOutGross", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "tokensOut", type: "uint256" },
      { name: "maxEthIn", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokensIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [
      { name: "tokensSent", type: "uint256" },
      { name: "ethSent", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Buy",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "ethIn", type: "uint256", indexed: false },
      { name: "tokensOut", type: "uint256", indexed: false },
      { name: "tokensSoldAfter", type: "uint256", indexed: false },
      { name: "ethReserveAfter", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Sell",
    inputs: [
      { name: "seller", type: "address", indexed: true },
      { name: "tokensIn", type: "uint256", indexed: false },
      { name: "ethOut", type: "uint256", indexed: false },
      { name: "tokensSoldAfter", type: "uint256", indexed: false },
      { name: "ethReserveAfter", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "hook", type: "address", indexed: true },
      { name: "router", type: "address", indexed: true },
      { name: "tokensSent", type: "uint256", indexed: false },
      { name: "ethSent", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * WETH9 on Base — deposit ETH to WETH, withdraw WETH to ETH.
 */
export const weth9Abi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * {@link platform/contracts/src/v4/UmbrellaV4SimpleSwap.sol} — exact-in v4 single-hop.
 */
export const umbrellaV4SimpleSwapAbi = [
  {
    type: "function",
    name: "swapExactIn",
    stateMutability: "payable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint256" },
      { name: "minOut", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [{ name: "delta", type: "int256" }],
  },
] as const;

export const erc20PermitAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;
