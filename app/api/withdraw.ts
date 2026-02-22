import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const config = { runtime: "edge" };

const withdrawAbi = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "credential_id", type: "bytes" },
      { name: "pubkey_x", type: "bytes32" },
      { name: "pubkey_y", type: "bytes32" },
      { name: "authenticator_data", type: "bytes" },
      { name: "signed_message_hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function ensureHex(value: unknown, name: string): Hex {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a hex string.`);
  }
  const hex = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`${name} is not valid hex.`);
  }
  return hex as Hex;
}

function ensureBytes32(value: unknown, name: string): Hex {
  const hex = ensureHex(value, name);
  if (hex.length !== 66) {
    throw new Error(`${name} must be 32 bytes.`);
  }
  return hex;
}

function ensureBytes(value: unknown, name: string, minBytes?: number): Hex {
  const hex = ensureHex(value, name);
  if (minBytes && hex.length < 2 + minBytes * 2) {
    throw new Error(`${name} must be at least ${minBytes} bytes.`);
  }
  return hex;
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  try {
    const rpcUrl = requireEnv("RPC_URL");
    const chainId = Number(requireEnv("CHAIN_ID"));
    const contractAddress = requireEnv("CONTRACT_ADDRESS");
    const privateKey = requireEnv("CLAIMER_PRIVATE_KEY");

    if (!Number.isFinite(chainId)) {
      throw new Error("CHAIN_ID must be a number.");
    }
    if (!isAddress(contractAddress)) {
      throw new Error("CONTRACT_ADDRESS is not a valid address.");
    }

    const account = privateKeyToAccount(ensureHex(privateKey, "CLAIMER_PRIVATE_KEY"));
    const chain = defineChain({
      id: chainId,
      name: "Custom",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
      },
    });

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const walletClient = createWalletClient({
      chain,
      transport: http(rpcUrl),
      account,
    });

    const publicKey = body?.publicKey ?? {};
    const credentialId = ensureBytes(body?.credentialId, "credentialId", 1);
    const pubkeyX = ensureBytes32(publicKey?.x, "publicKey.x");
    const pubkeyY = ensureBytes32(publicKey?.y, "publicKey.y");
    const authenticatorData = ensureBytes(body?.authenticatorData, "authenticatorData", 37);
    const signedMessageHash = ensureBytes32(body?.signedMessageHash, "signedMessageHash");
    const signature = ensureBytes(body?.signature, "signature");
    if (signature.length !== 130) {
      throw new Error("signature must be 64 bytes.");
    }
    const recipient = body?.recipient;
    if (!isAddress(recipient)) {
      throw new Error("recipient must be a valid address.");
    }

    const args = [
      credentialId,
      pubkeyX,
      pubkeyY,
      authenticatorData,
      signedMessageHash,
      signature,
      recipient,
    ] as const;

    const simulation = await publicClient.simulateContract({
      address: contractAddress as Hex,
      abi: withdrawAbi,
      functionName: "withdraw",
      args,
      account,
    });

    if (!simulation.result) {
      return jsonResponse({ error: "Withdraw rejected." }, 400);
    }

    const txHash = await walletClient.writeContract(simulation.request);
    return jsonResponse({ txHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Withdraw failed.";
    return jsonResponse({ error: message }, 500);
  }
}
