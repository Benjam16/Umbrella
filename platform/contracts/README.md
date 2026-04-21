# @umbrella/contracts

Foundry workspace for Umbrella's on-chain stack on Base.

The contracts in here close the Proof-of-Work loop: off-chain missions run in
the Umbrella cloud/CLI, the RelayerService anchors their outcomes as EIP-712
attestations, and the Uniswap v4 hook uses those attestations to drive live
market behavior for each agent's ERC-20.

## The stack

| Contract                          | Role                                                                    | File |
| --------------------------------- | ----------------------------------------------------------------------- | ---- |
| `MissionProofLib`                 | Canonical EIP-712 typehash + struct used by signer + contracts           | `src/libraries/MissionProofLib.sol` |
| `UmbrellaAgentToken`              | Labor-backed ERC-20. Rolling success rate, EIP-712 `recordSuccess`, on-chain treasury | `src/UmbrellaAgentToken.sol` |
| `UmbrellaAgentTokenFactory`       | One-click token launcher (CREATE2). Blueprint → token map for relayer + UI | `src/UmbrellaAgentTokenFactory.sol` |
| `UmbrellaAgentRegistry`           | ERC-721 agent identity. Reputation proxies through to the token          | `src/UmbrellaAgentRegistry.sol` |
| `UmbrellaPerformanceHook`         | Placeholder / future dynamic-fee surface (not full `IHooks` yet)          | `src/hooks/UmbrellaPerformanceHook.sol` |
| `UmbrellaPlatformFeeHook`       | Uniswap v4 `IHooks`: skim on unspecified leg, then **split** (default **40%** to registered **creator**, rest to **treasury**) via double `take`; `registerPool` + optional `poolRegistrar` for Forge | `src/hooks/UmbrellaPlatformFeeHook.sol` |

Deploy the platform hook (CREATE2-mined address bits):

```bash
# .env: PRIVATE_KEY, V4_POOL_MANAGER, TREASURY_ADDRESS,
#       optional PLATFORM_FEE_BPS (default 80 = 0.8% of unspecified leg),
#       optional CREATOR_SHARE_OF_FEE_BPS (default 4000 = 40% of skim → creator)
forge script script/DeployPlatformFeeHook.s.sol --rpc-url base_sepolia --broadcast --verify -vvv
```

After pool `initialize`, call **`registerPool(poolKey, creator)`** on the hook (owner or `poolRegistrar`) so swaps push the creator share **directly** to their wallet.

## One-time setup

```bash
cd platform/contracts

# 1. Pull the latest Foundry (the system one can be years out of date).
foundryup

# 2. Install the Solidity libs Foundry needs.
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install Uniswap/v4-core --no-commit
forge install Uniswap/v4-periphery --no-commit

# 3. Configure deployment inputs.
cp .env.example .env
$EDITOR .env   # fill PRIVATE_KEY, ATTESTER_ADDRESS, BASESCAN_API_KEY
```

## Workflow

```bash
pnpm build                    # forge build
pnpm test                     # forge test -vv
pnpm deploy:sepolia           # forge script DeployUmbrella --broadcast --verify
pnpm sync -- --chain base_sepolia   # write real addresses into
                              # platform/apps/api/config/agent-registry.json
```

## How off-chain and on-chain signatures stay in sync

The RelayerService (`platform/apps/api/src/services/relayer/`) signs every
mission outcome as EIP-712 typed data. The `MissionProof` struct lives in:

- **Solidity:** `src/libraries/MissionProofLib.sol` (single source of truth)
- **TypeScript:** `platform/apps/api/src/services/relayer/signer.ts`
  (`MISSION_PROOF_TYPES`)

If you change a field in one place, change both.

The EIP-712 domain is `UmbrellaAgentToken` / version `1` / the specific
token address / the deployment chain ID. That means the same signature
cannot be replayed across chains or across different agent tokens.

## Deploying the Uniswap v4 hook

The hook's on-chain address must encode `BEFORE_SWAP_FLAG | AFTER_SWAP_FLAG`
in its trailing bytes. `script/DeployHook.s.sol` mines a CREATE2 salt to
achieve this. Run it only after the v4 PoolManager address is live on your
target chain; the current canonical addresses are published in:

- https://docs.uniswap.org/contracts/v4/deployments

Set `V4_POOL_MANAGER` in `.env`, then:

```bash
forge script script/DeployHook.s.sol --rpc-url base_sepolia --broadcast --verify -vvv
```

## Gas sponsorship (CDP Paymaster)

After deployment:

1. Open Coinbase Developer Platform → Onchain Tools → Paymaster.
2. Allowlist every deployed address from `deployments.json`:
   - `UmbrellaAgentRegistry`
   - `UmbrellaAgentTokenFactory`
   - Every `UmbrellaAgentToken` created at genesis
3. Allow these function selectors:
   - `recordSuccess` → `0xf9b6127c`
   - `createAgentToken` → `0x89b39351`
   - `registerAgent` → `0xc760b045`
   - `linkAgentToken` → `0xf05fcb63`
4. Copy your Paymaster URL into `platform/apps/api/.env`:
   ```
   CDP_PAYMASTER_URL=https://api.developer.coinbase.com/rpc/v1/base/....
   CDP_PROJECT_ID=...
   ```

The `/v1/paymaster/rpc` route in `@umbrella/api` re-enforces the allowlist
so nobody can exfiltrate your RPC URL from the browser and burn your
$15k Gasless Campaign credits.

## Registering contracts post-deploy

`scripts/sync-registry.ts` reads the `broadcast/*/run-latest.json` produced
by Foundry and writes:

- `platform/apps/api/config/agent-registry.json` — the blueprint→token map
  the RelayerService consults before every anchor.
- `platform/apps/api/config/deployments.json` — full deployment record
  (registry, factory, tokens, timestamps) for audit trails.

Always run it immediately after every deploy.
