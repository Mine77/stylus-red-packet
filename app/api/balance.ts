import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Hex,
} from "viem";

export const config = { runtime: "edge" };

const balanceAbi = [
  {
    type: "function",
    name: "balanceOfPasskey",
    stateMutability: "view",
    inputs: [
      { name: "credential_id", type: "bytes" },
      { name: "pubkey_x", type: "bytes32" },
      { name: "pubkey_y", type: "bytes32" },
      { name: "authenticator_data", type: "bytes" },
      { name: "signed_message_hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "balance", type: "uint256" }],
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

function zeroBytes32(): Hex {
  return "0x" + "00".repeat(32) as Hex;
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

    if (!Number.isFinite(chainId)) {
      throw new Error("CHAIN_ID must be a number.");
    }
    if (!isAddress(contractAddress)) {
      throw new Error("CONTRACT_ADDRESS is not a valid address.");
    }

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

    const publicKey = body?.publicKey ?? {};
    const credentialId = ensureBytes(body?.credentialId, "credentialId", 1);
    const pubkeyX = ensureBytes32(publicKey?.x, "publicKey.x");
    const pubkeyY = ensureBytes32(publicKey?.y, "publicKey.y");
    const authenticatorData = body?.authenticatorData
      ? ensureBytes(body?.authenticatorData, "authenticatorData", 37)
      : ("0x" as Hex);
    const signedMessageHash = body?.signedMessageHash
      ? ensureBytes32(body?.signedMessageHash, "signedMessageHash")
      : zeroBytes32();
    const signature = body?.signature
      ? ensureBytes(body?.signature, "signature")
      : ("0x" as Hex);

    const args = [
      credentialId,
      pubkeyX,
      pubkeyY,
      authenticatorData,
      signedMessageHash,
      signature,
    ] as const;

    const balance = await publicClient.readContract({
      address: contractAddress as Hex,
      abi: balanceAbi,
      functionName: "balanceOfPasskey",
      args,
    });

    return jsonResponse({ balance: balance.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Balance query failed.";
    return jsonResponse({ error: message }, 500);
  }
}
