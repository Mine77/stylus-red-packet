import { useEffect, useRef } from "react"
import { toast } from "sonner"
import {
  useConnection,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"

import { helloWorldAbi } from "@/lib/helloWorldAbi"

const contractAddress = import.meta.env
  .VITE_HELLO_WORLD_ADDRESS as `0x${string}` | undefined
const fallbackAddress = "0x0000000000000000000000000000000000000000"

type HelloWorldWriteFunction =
  | "increment"
  | "setNumber"
  | "addNumber"
  | "mulNumber"
  | "addFromMsgValue"

export function useHelloWorld() {
  const { isConnected } = useConnection()
  const isAddressReady = Boolean(contractAddress)
  const toastIdRef = useRef<string | number | undefined>(undefined)

  const { data: currentNumber, refetch: refetchNumber } = useReadContract({
    abi: helloWorldAbi,
    address: (contractAddress ?? fallbackAddress) as `0x${string}`,
    functionName: "number",
    query: {
      enabled: isAddressReady,
    },
  })

  const {
    data: txHash,
    isPending,
    mutateAsync: writeAsync,
  } = useWriteContract()
  const {
    isLoading: isConfirming,
    isSuccess,
    isError,
    error,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: Boolean(txHash),
    },
  })

  useEffect(() => {
    if (!isConfirming || !toastIdRef.current) {
      return
    }

    toast.loading("交易已发送，等待链上确认...", {
      id: toastIdRef.current,
    })
  }, [isConfirming])

  useEffect(() => {
    if (!isSuccess) {
      return
    }

    toast.success("交易已确认。", { id: toastIdRef.current })
    toastIdRef.current = undefined
    refetchNumber()
  }, [isSuccess, refetchNumber])

  useEffect(() => {
    if (!isError || !error) {
      return
    }

    const message = error instanceof Error ? error.message : "交易失败。"
    toast.error(message, { id: toastIdRef.current })
    toastIdRef.current = undefined
  }, [isError, error])

  const write = async (
    functionName: HelloWorldWriteFunction,
    args: readonly bigint[] = [],
    value?: bigint,
  ) => {
    if (!isConnected) {
      toast.error("请先连接钱包。")
      return
    }
    if (!contractAddress) {
      toast.error("请先设置合约地址。")
      return
    }

    const toastId = toast.loading("等待钱包确认...")
    toastIdRef.current = toastId

    try {
      return await writeAsync({
        abi: helloWorldAbi,
        address: contractAddress,
        functionName,
        args,
        value,
      })
    } catch (writeError) {
      const message =
        writeError instanceof Error ? writeError.message : "交易失败。"
      toast.error(message, { id: toastId })
      toastIdRef.current = undefined
      return undefined
    }
  }

  return {
    addFromMsgValue: (amount: bigint) => write("addFromMsgValue", [], amount),
    addNumber: (value: bigint) => write("addNumber", [value]),
    contractAddress,
    currentNumber,
    increment: () => write("increment"),
    isAddressReady,
    isConnected,
    isConfirming,
    isPending,
    mulNumber: (value: bigint) => write("mulNumber", [value]),
    refetchNumber,
    setNumber: (value: bigint) => write("setNumber", [value]),
    txHash,
  }
}
