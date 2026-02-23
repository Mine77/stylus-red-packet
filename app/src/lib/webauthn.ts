import { decode } from "cbor-x";

type StoredCredential = {
  id: string;
  publicKeyX: string;
  publicKeyY: string;
  userId: string;
};

type Bytes = Uint8Array<ArrayBuffer>;

type ClaimPayload = {
  credentialId: Bytes;
  publicKeyX: Bytes;
  publicKeyY: Bytes;
  signature: Bytes;
  authenticatorData: Bytes;
  signedMessageHash: Bytes;
};

type AssertionData = {
  rawId: Bytes;
  authenticatorData: Bytes;
  clientDataJSON: Bytes;
  signature: Bytes;
};

export type CachedCredential = {
  credentialId: Bytes;
  publicKeyX: Bytes;
  publicKeyY: Bytes;
};

const STORAGE_KEY = "red-packet-passkey";
const CHALLENGE_BYTES = 32;

function randomBytes(length: number): Bytes {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const normalized = padded + "=".repeat(padLength);
  const binary = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256(data: ArrayBuffer | Bytes): Promise<Bytes> {
  const bufferSource: BufferSource = data instanceof Uint8Array ? data : data;
  const hash = await crypto.subtle.digest("SHA-256", bufferSource);
  return new Uint8Array(hash);
}

function getStoredCredential(): StoredCredential | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredCredential;
    if (!parsed?.id || !parsed.publicKeyX || !parsed.publicKeyY || !parsed.userId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getCachedCredential(): CachedCredential | null {
  const stored = getStoredCredential();
  if (!stored) {
    return null;
  }
  return {
    credentialId: fromBase64Url(stored.id),
    publicKeyX: fromBase64Url(stored.publicKeyX),
    publicKeyY: fromBase64Url(stored.publicKeyY),
  };
}

function setStoredCredential(value: StoredCredential) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearCachedCredential() {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

function normalizeCoordinate(bytes: Uint8Array): Bytes {
  if (bytes.length === 32) {
    return bytes as Bytes;
  }
  if (bytes.length > 32) {
    return bytes.slice(bytes.length - 32) as Bytes;
  }
  const padded = new Uint8Array(new ArrayBuffer(32));
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Bytes {
  const merged = new Uint8Array(new ArrayBuffer(a.length + b.length));
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

function parsePublicKey(attestationObject: ArrayBuffer): {
  publicKeyX: Bytes;
  publicKeyY: Bytes;
} {
  const decoded = decode(new Uint8Array(attestationObject)) as {
    authData?: Uint8Array;
  };
  const authData = decoded.authData;
  if (!authData) {
    throw new Error("Attestation data missing authData.");
  }

  const dataView = new DataView(
    authData.buffer,
    authData.byteOffset,
    authData.byteLength,
  );
  let offset = 0;
  offset += 32; // rpIdHash
  const flags = authData[offset];
  offset += 1;
  offset += 4; // signCount

  const hasAttestedCredentialData = (flags & 0x40) !== 0;
  if (!hasAttestedCredentialData) {
    throw new Error("Missing attested credential data.");
  }

  offset += 16; // aaguid
  const credentialIdLength = dataView.getUint16(offset, false);
  offset += 2;
  offset += credentialIdLength;

  const cosePublicKey = decode(authData.slice(offset)) as Map<number, unknown> | Record<number, unknown>;
  const getValue = (key: number) =>
    cosePublicKey instanceof Map ? cosePublicKey.get(key) : (cosePublicKey as Record<number, unknown>)[key];

  const xValue = getValue(-2);
  const yValue = getValue(-3);
  if (!(xValue instanceof Uint8Array) || !(yValue instanceof Uint8Array)) {
    throw new Error("Invalid COSE public key format.");
  }

  return {
    publicKeyX: normalizeCoordinate(xValue),
    publicKeyY: normalizeCoordinate(yValue),
  };
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; offset: number } {
  const first = bytes[offset];
  if (first < 0x80) {
    return { length: first, offset: offset + 1 };
  }
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i += 1) {
    length = (length << 8) | bytes[offset + 1 + i];
  }
  return { length, offset: offset + 1 + numBytes };
}

function trimDerInteger(bytes: Uint8Array): Bytes {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) {
    start += 1;
  }
  return bytes.slice(start) as Bytes;
}

function derSignatureToRaw(signature: Uint8Array): Bytes {
  if (signature[0] !== 0x30) {
    throw new Error("Invalid DER signature.");
  }
  let offset = 1;
  const seq = readDerLength(signature, offset);
  offset = seq.offset;

  if (signature[offset] !== 0x02) {
    throw new Error("Invalid DER signature (missing r).");
  }
  offset += 1;
  const rLen = readDerLength(signature, offset);
  const rStart = rLen.offset;
  const r = trimDerInteger(signature.slice(rStart, rStart + rLen.length));
  offset = rStart + rLen.length;

  if (signature[offset] !== 0x02) {
    throw new Error("Invalid DER signature (missing s).");
  }
  offset += 1;
  const sLen = readDerLength(signature, offset);
  const sStart = sLen.offset;
  const s = trimDerInteger(signature.slice(sStart, sStart + sLen.length));

  const rOut = normalizeCoordinate(r);
  const sOut = normalizeCoordinate(s);
  const raw = new Uint8Array(new ArrayBuffer(64));
  raw.set(rOut, 0);
  raw.set(sOut, 32);
  return raw;
}

async function createPasskey(rpId: string): Promise<StoredCredential> {
  const userIdBytes = randomBytes(16);
  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    rp: {
      name: "Red Packet",
      id: rpId,
    },
    user: {
      id: userIdBytes,
      name: "red-packet-user",
      displayName: "Red Packet User",
    },
    challenge: randomBytes(CHALLENGE_BYTES),
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: {
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60000,
    attestation: "none",
  };

  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Failed to create passkey.");
  }

  const attestation = credential.response as AuthenticatorAttestationResponse;
  const { publicKeyX, publicKeyY } = parsePublicKey(attestation.attestationObject);

  return {
    id: toBase64Url(new Uint8Array(credential.rawId)),
    publicKeyX: toBase64Url(publicKeyX),
    publicKeyY: toBase64Url(publicKeyY),
    userId: toBase64Url(userIdBytes),
  };
}

async function getAssertion(rpId: string, credentialId: Bytes): Promise<AssertionData> {
  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: randomBytes(CHALLENGE_BYTES),
    rpId,
    userVerification: "required",
    allowCredentials: [
      {
        type: "public-key",
        id: credentialId,
      },
    ],
    timeout: 60000,
  };

  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Failed to fetch passkey assertion.");
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    rawId: new Uint8Array(credential.rawId),
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON: new Uint8Array(response.clientDataJSON),
    signature: new Uint8Array(response.signature),
  };
}

export async function registerPasskey(rpId: string): Promise<CachedCredential> {
  if (!rpId) {
    throw new Error("Missing RP ID.");
  }

  const stored = await createPasskey(rpId);
  setStoredCredential(stored);
  return {
    credentialId: fromBase64Url(stored.id),
    publicKeyX: fromBase64Url(stored.publicKeyX),
    publicKeyY: fromBase64Url(stored.publicKeyY),
  };
}

export async function buildAssertionPayload(rpId: string): Promise<ClaimPayload> {
  if (!rpId) {
    throw new Error("Missing RP ID.");
  }

  const stored = getStoredCredential();
  if (!stored) {
    throw new Error("Passkey not found. Create one first.");
  }

  const credentialId = fromBase64Url(stored.id);
  const assertion = await getAssertion(rpId, credentialId);
  const clientDataHash = await sha256(assertion.clientDataJSON);
  const signedMessageHash = await sha256(
    concatBytes(assertion.authenticatorData, clientDataHash),
  );
  const signature = derSignatureToRaw(assertion.signature);

  return {
    credentialId: assertion.rawId,
    publicKeyX: fromBase64Url(stored.publicKeyX),
    publicKeyY: fromBase64Url(stored.publicKeyY),
    signature,
    authenticatorData: assertion.authenticatorData,
    signedMessageHash,
  };
}
