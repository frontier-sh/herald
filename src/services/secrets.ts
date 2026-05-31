// AES-GCM encryption for secrets that must live in D1 but never be returned to
// any client. The key is derived from the deployment's session_secret, so the
// stored value is ciphertext at rest and is decrypted only server-side at the
// point of use. This protects against exposure through API/UI responses, logs,
// and casual row dumps; it is not a defense against full-database compromise,
// since the deriving secret lives in the same database.

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', ENCODER.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Returns "iv.ciphertext" (both base64). The base64 alphabet contains no '.',
// so the separator is unambiguous.
export async function encryptSecret(
  plaintext: string,
  secret: string,
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENCODER.encode(plaintext),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

// Returns null when the input is malformed or authentication fails (e.g. the
// session_secret has since been rotated).
export async function decryptSecret(
  stored: string,
  secret: string,
): Promise<string | null> {
  const dot = stored.indexOf('.');
  if (dot === -1) return null;
  try {
    const iv = fromBase64(stored.slice(0, dot)) as unknown as BufferSource;
    const ciphertext = fromBase64(stored.slice(dot + 1)) as unknown as BufferSource;
    const key = await deriveKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return DECODER.decode(plaintext);
  } catch {
    return null;
  }
}
