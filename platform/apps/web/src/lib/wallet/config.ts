import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

/**
 * Umbrella targets Base (mainnet + sepolia). `injected` picks up MetaMask,
 * Rabbit, Frame, etc.; `coinbaseWallet` gives us the first-class Smart Wallet
 * path we rely on for Paymaster-sponsored UserOps.
 *
 * Note: we deliberately avoid WalletConnect until the user adds a
 * `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — WC without a project id throws at
 * boot, which would break the entire app shell.
 */
/**
 * Note: we intentionally do NOT set `ssr: true`. The `WalletProvider` is
 * mounted below a `"use client"` boundary and Next.js 15 static export of
 * the default /500 page does not play well with wagmi's SSR hydration path.
 * Since every consumer is a client component there is no server render we
 * need to cover.
 */
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Umbrella", preference: "smartWalletOnly" }),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});

export const SUPPORTED_CHAIN_IDS = [base.id, baseSepolia.id] as const;
