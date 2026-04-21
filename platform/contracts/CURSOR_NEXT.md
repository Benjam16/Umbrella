# Base Sepolia launch — step-by-step

Your Foundry workspace is wired. Follow this checklist end-to-end.

## 1. Update Foundry and install libs

The system `forge` on your Mac is from 2022. Grab the latest:

```bash
foundryup
cd platform/contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install Uniswap/v4-core --no-commit
forge install Uniswap/v4-periphery --no-commit
```

Tip: `forge install` writes to `lib/`. That folder is gitignored — every
contributor re-installs. If you want the monorepo to vendor the libs,
drop the entry from `.gitignore` and commit `lib/`.

## 2. Create a deployer wallet

Open Coinbase Wallet → Create burner account → export private key.
Fund it with ~0.05 testnet ETH:

- https://www.alchemy.com/faucets/base-sepolia
- https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

## 3. Decide on the attester address

Option A (recommended for now): run the relayer locally so its ephemeral
key becomes the attester. Start the API once — you'll see:

```
[relayer] UMBRELLA_RELAYER_PRIVATE_KEY not set — generated ephemeral key. Attester=0xAb12…
```

Copy that address. Then make it permanent by setting
`UMBRELLA_RELAYER_PRIVATE_KEY` in `platform/apps/api/.env` to a fresh hex key
(32 random bytes, `0x` prefix) and record its public address via:

```bash
cd platform/apps/api
pnpm tsx src/services/relayer/cli.ts identity
```

Option B (later, production): generate the attester in a TEE and only expose
the address.

## 4. Configure `platform/contracts/.env`

```ini
PRIVATE_KEY=0x<your burner key>
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=<get one from https://basescan.org/myapikey>
ATTESTER_ADDRESS=0x<from step 3>
```

## 5. Compile + test

```bash
cd platform/contracts
forge test -vv
```

You should see ~18 tests pass (AgentToken + Factory + Registry).

## 6. Deploy to Base Sepolia

```bash
pnpm deploy:sepolia
```

Foundry will:

1. Deploy `UmbrellaAgentRegistry`.
2. Deploy `UmbrellaAgentTokenFactory`.
3. Launch 4 genesis AgentTokens via the factory (competitor-scrape,
   rwa-scanner, terminal-feed, alpha-scribe) — `1_000_000` initial supply each,
   minted to the deployer.
4. Register each agent in the Registry with a manifest URL.
5. Verify every contract on BaseScan.

## 7. Sync the registry file the API reads

```bash
pnpm sync -- --chain base_sepolia
```

This overwrites `platform/apps/api/config/agent-registry.json` with the real
deployed addresses. The relayer will pick them up on the next tick.

## 8. Wire the Paymaster

In the CDP portal (https://portal.cdp.coinbase.com):

1. Onchain Tools → Paymaster → **Base Sepolia** tab.
2. Paste the 4 token addresses + the factory + the registry into the
   contract allowlist.
3. Add selectors: `0xf9b6127c` (recordSuccess), `0x89b39351` (createAgentToken),
   `0xc760b045` (registerAgent), `0xf05fcb63` (linkAgentToken).
4. **Swarm v4 liquidity seeding (UmbrellaV4Router “unlock” path):** add your
   deployed `UmbrellaV4Router` address (same value as `UMBRELLA_V4_LIQUIDITY_ROUTER`
   in `platform/apps/api/.env`), the canonical v4 **PoolManager**, and every
   **ERC-20** the swarm will `approve` (mission token, WETH/quote). Add
   selectors `0x095ea7b3` (ERC20 `approve`) and `0x5a6bcfda`
   (`UmbrellaV4Router.modifyLiquidity`). Without these, gasless UserOps from
   `launchSwarm` will be rejected by CDP.
5. Per-user limit: `$0.10`. Global daily: `$1.00` (raise after smoke tests).
6. Copy the Paymaster URL.

Drop it into `platform/apps/api/.env`:

```ini
CDP_PAYMASTER_URL=https://api.developer.coinbase.com/rpc/v1/base-sepolia/<token>
CDP_PROJECT_ID=<from the CDP dashboard>
UMBRELLA_FACTORY_ADDRESS=0x...
UMBRELLA_REGISTRY_ADDRESS=0x...
UMBRELLA_V4_LIQUIDITY_ROUTER=0x<your UmbrellaV4Router>
V4_POOL_MANAGER_BASE_SEPOLIA=0x<canonical PoolManager on Base Sepolia>
```

Restart the API. Hit `GET /v1/paymaster/status` (after logging in) and you
should see `configured: true` + a non-zero `allowlistSize`.

## 9. Smoke-test the full loop

```bash
# In one terminal:
cd platform/apps/api
pnpm dev

# In another — run a mission from the web app (/app) and wait for
# "run finished". Then:
curl -s http://localhost:3000/api/v1/runs/<runId>/anchor | jq
```

You should see the on-chain anchor with a real BaseScan-linkable `txHash`.

## 10. Deploy the Uniswap v4 hook (when you're ready)

After the v4 PoolManager is live on Base and you've seeded at least one
liquidity pool:

```ini
# .env
V4_POOL_MANAGER=0x<official PoolManager address>
```

```bash
forge script script/DeployHook.s.sol --rpc-url base_sepolia --broadcast --verify -vvv
# Paste the printed hook address into your pool initialization call.
```

## 11. Production (Base mainnet)

Do **all** of the above in order on mainnet. Before hitting
`deploy:mainnet`:

- Move the deployer key into Google KMS or 1Password.
- Swap `UMBRELLA_RELAYER_PRIVATE_KEY` for a KMS-backed signer.
- Transfer ownership of the Registry + Factory to a 2-of-3 Safe.
- Raise CDP Paymaster limits as usage stabilizes.

Done? File the deployed addresses in `platform/apps/api/config/deployments.json`
and open a PR. The marketplace will start displaying real anchored missions
within one relayer tick (~10s).
