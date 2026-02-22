import { WagmiAdapter } from "@reown/appkit-adapter-wagmi"
import type { AppKitNetwork } from "@reown/appkit/networks"
import { arbitrumSepolia } from "@reown/appkit/networks"
import { createAppKit } from "@reown/appkit/react"
import { QueryClient } from "@tanstack/react-query"

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID

if (!projectId) {
  throw new Error(
    "Missing VITE_REOWN_PROJECT_ID. Set it in a .env file before running the app.",
  )
}

const appUrl =
  typeof window === "undefined" ? "http://localhost" : window.location.origin

const metadata = {
  name: "React Vite Starter",
  description: "React Vite AppKit starter",
  url: appUrl,
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
}

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [arbitrumSepolia]

export const queryClient = new QueryClient()

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
})

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics:false,
    socials:false
  }
})
