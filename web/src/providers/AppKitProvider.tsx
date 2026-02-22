import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider } from "wagmi"

import { queryClient, wagmiAdapter } from "@/lib/appkit"

type AppKitProviderProps = {
  children: ReactNode
}

export function AppKitProvider({ children }: AppKitProviderProps) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
