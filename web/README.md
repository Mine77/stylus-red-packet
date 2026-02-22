# React + Vite + Tailwind CSS + Biome + AppKit

A minimal React Vite starter with Tailwind CSS, Biome, and Reown AppKit wallet connect.

## What's Included

- Tailwind CSS via the official Vite plugin (no PostCSS config needed)
- Biome for formatting and linting
- Reown AppKit + Wagmi + Viem wallet connect
- TypeScript + React 19 + Vite

## Getting Started

```bash
pnpm install
pnpm dev
```

## Build & Preview

```bash
pnpm build
pnpm preview
```

## Code Quality

```bash
pnpm lint
pnpm format
```

## Environment Variables

Create a `.env` file and add your Reown project id plus the Stylus contract
address:

```bash
VITE_REOWN_PROJECT_ID=YOUR_PROJECT_ID
VITE_HELLO_WORLD_ADDRESS=0xYOUR_CONTRACT_ADDRESS
```

You can copy from `.env.example`.

## AppKit Notes

- AppKit is initialized in `src/lib/appkit.ts`.
- The app is wrapped with `AppKitProvider` in `src/main.tsx`.
- The connect button uses `AppKitButton` on the home page.

### RPC (optional)

If balance or RPC calls fail, you can provide your own RPCs in `src/lib/appkit.ts`:

```ts
import { http } from "viem"

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  transports: {
    [mainnet.id]: http("https://eth.llamarpc.com"),
    [arbitrum.id]: http("https://arbitrum.llamarpc.com"),
  },
})
```

## Project Structure

- `src/index.css` uses `@import "tailwindcss";`
- `vite.config.ts` enables `@tailwindcss/vite`
- `biome.json` provides the default Biome config
- `src/lib/appkit.ts` sets up AppKit + Wagmi
