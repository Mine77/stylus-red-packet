# Web Red Packet (Vite + React + Vercel Edge)

A Vite React app that creates a passkey, signs a WebAuthn assertion, and calls a Vercel Edge API to claim a red packet.

## Environment Variables (Vercel / .env.local)

```
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_ID=421614
CONTRACT_ADDRESS=0xEscrowContract
CLAIMER_PRIVATE_KEY=0xYourPrivateKey
VITE_RP_ID=stylus-red-packet.vercel.app # optional, defaults to window.location.hostname
```

## Dev

```
pnpm install
pnpm dev
```

## Deploy to Vercel

Deploy `web-red-packet` as a Vite project. The Edge API is:

```
POST /api/claim
POST /api/withdraw
POST /api/balance
```

Request body:

```json
{
  "credentialId": "0x...",
  "publicKey": { "x": "0x...", "y": "0x..." },
  "signature": "0x...",
  "authenticatorData": "0x...",
  "signedMessageHash": "0x..."
}
```

Withdraw request body:

```json
{
  "credentialId": "0x...",
  "publicKey": { "x": "0x...", "y": "0x..." },
  "signature": "0x...",
  "authenticatorData": "0x...",
  "signedMessageHash": "0x...",
  "recipient": "0x..."
}
```

Balance request body:

```json
{
  "credentialId": "0x...",
  "publicKey": { "x": "0x...", "y": "0x..." },
  "signature": "0x...",
  "authenticatorData": "0x...",
  "signedMessageHash": "0x..."
}
```
