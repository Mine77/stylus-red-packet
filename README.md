# Stylus Red Packet (Passkey Wallet)

This repo contains:
- `stylus-webauthn/` — WebAuthn verifier contract (P-256)
- `stylus-redpacket/` — escrow contract (balances + withdraw)
- `app/` — Vite + React frontend + Vercel Edge API

## Prerequisites

- Rust toolchain with `wasm32-unknown-unknown`
- `cargo stylus` CLI
- Node.js + pnpm
- Foundry `cast` (used for initialization + funding)

## One-Command Deploy + Init

Create a root `.env` file (copy from `.env.example`) with:

```
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_ID=421614
DEPLOYER_PRIVATE_KEY=0xYOUR_KEY
CLAIMER_PRIVATE_KEY=0xYOUR_API_SIGNER_KEY   # optional, defaults to DEPLOYER_PRIVATE_KEY
RP_ID=your-app.vercel.app                    # or set RP_ID_HASH directly
RP_ID_LOCALHOST=true                         # optional, sets RP_ID=localhost
CLAIM_AMOUNT_WEI=1000000000000000            # 0.001 ETH
FUND_AMOUNT_WEI=10000000000000000            # 0.01 ETH
MAX_FEE_PER_GAS_GWEI=0.03                    # optional
STYLUS_NO_VERIFY=true                        # optional
```

Run:

```
./scripts/deploy-contracts.sh
```

This will:
- deploy `stylus-webauthn`
- initialize it with `RP_ID_HASH`
- deploy `stylus-redpacket`
- initialize it with the verifier address + claim amount
- fund the escrow from the deployer key
- write `app/.env.local`
- update `.env` with `VERIFIER_ADDRESS`, `ESCROW_ADDRESS`, and `RP_ID_HASH`

## Run the App

```
cd app
pnpm install
pnpm dev
```

The API routes are:
- `POST /api/claim`
- `POST /api/withdraw`

## Notes

- The frontend computes `signed_message_hash = sha256(authenticator_data || client_data_hash)` off-chain.
- The escrow contract delegates passkey verification to the verifier contract.
