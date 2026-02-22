export function toHex(data: ArrayBuffer | Uint8Array): `0x${string}` {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `0x${hex}` as `0x${string}`;
}
