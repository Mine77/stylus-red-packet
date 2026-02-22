import { AppKitButton } from "@reown/appkit/react"
import { useState } from "react"
import { toast } from "sonner"
import { parseEther } from "viem"

import { Toaster } from "@/components/ui/sonner"
import { useHelloWorld } from "@/hooks/useHelloWorld"

function App() {
  const {
    addFromMsgValue,
    addNumber,
    contractAddress,
    currentNumber,
    increment,
    isAddressReady,
    isConnected,
    isPending,
    mulNumber,
    refetchNumber,
    setNumber,
    txHash,
  } = useHelloWorld()
  const [setInput, setSetInput] = useState("0")
  const [addInput, setAddInput] = useState("1")
  const [mulInput, setMulInput] = useState("2")
  const [valueInput, setValueInput] = useState("0.001")

  const parseUint = (value: string) => {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <Toaster position="top-right" richColors />
      <main className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Stylus Hello World
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Interact with the Stylus contract
          </h1>
          <p className="text-base text-slate-600 sm:text-lg">
            Connect your wallet on Arbitrum Sepolia and update the on-chain
            number.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Wallet</p>
                <p className="text-xs text-slate-400">
                  Connect with AppKit to start interacting.
                </p>
              </div>
              <AppKitButton label="Connect wallet" loadingLabel="" />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-500">Contract</p>
              <p className="text-xs text-slate-400">
                {contractAddress ?? "Set VITE_HELLO_WORLD_ADDRESS in .env"}
              </p>
              <p className="text-xs text-slate-400">Network: Arbitrum Sepolia</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Current number</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {typeof currentNumber === "bigint"
                  ? currentNumber.toString()
                  : "--"}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                disabled={!isConnected || isPending || !isAddressReady}
                onClick={() => increment()}
                type="button"
              >
                Increment
              </button>
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                disabled={!isConnected || !isAddressReady}
                onClick={() => refetchNumber()}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Set number
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  disabled={!isConnected || !isAddressReady}
                  inputMode="numeric"
                  onChange={(event) => setSetInput(event.target.value)}
                  value={setInput}
                />
              </label>
              <button
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                disabled={!isConnected || isPending || !isAddressReady}
                onClick={() => {
                  const parsed = parseUint(setInput)
                  if (parsed === null) {
                    toast.error("设置值必须是有效整数。")
                    return
                  }
                  setNumber(parsed)
                }}
                type="button"
              >
                Set Number
              </button>
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Add number
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  disabled={!isConnected || !isAddressReady}
                  inputMode="numeric"
                  onChange={(event) => setAddInput(event.target.value)}
                  value={addInput}
                />
              </label>
              <button
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                disabled={!isConnected || isPending || !isAddressReady}
                onClick={() => {
                  const parsed = parseUint(addInput)
                  if (parsed === null) {
                    toast.error("加数必须是有效整数。")
                    return
                  }
                  addNumber(parsed)
                }}
                type="button"
              >
                Add Number
              </button>
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                Multiply by
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  disabled={!isConnected || !isAddressReady}
                  inputMode="numeric"
                  onChange={(event) => setMulInput(event.target.value)}
                  value={mulInput}
                />
              </label>
              <button
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                disabled={!isConnected || isPending || !isAddressReady}
                onClick={() => {
                  const parsed = parseUint(mulInput)
                  if (parsed === null) {
                    toast.error("乘数必须是有效整数。")
                    return
                  }
                  mulNumber(parsed)
                }}
                type="button"
              >
                Multiply
              </button>
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                ETH value to add
                <input
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  disabled={!isConnected || !isAddressReady}
                  inputMode="decimal"
                  onChange={(event) => setValueInput(event.target.value)}
                  value={valueInput}
                />
              </label>
              <button
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                disabled={!isConnected || isPending || !isAddressReady}
                onClick={() => {
                  try {
                    const parsed = parseEther(valueInput || "0")
                    addFromMsgValue(parsed)
                  } catch {
                    toast.error("ETH 数值无效。")
                  }
                }}
                type="button"
              >
                Add from msg.value
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-xs text-slate-500">
            {txHash && (
              <p>
                Last tx: <span className="font-mono">{txHash}</span>
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
