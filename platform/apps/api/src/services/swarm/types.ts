import type { Address, Hex } from "viem";

export type SwarmCall = {
  to: Address;
  data: Hex;
  value: bigint;
};
