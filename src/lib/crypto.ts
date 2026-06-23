import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// AES-256-GCM authenticated encryption for data at rest (e.g. Plaid access tokens).
// Satisfies the FTC Safeguards Rule requirement to encrypt customer financial data.
//
// Key management: TOKEN_ENC_KEY must be a 32-byte key, base64-encoded, supplied via a
// secret manager (Vercel env var / KMS) — NEVER committed and NEVER stored next to the
// ciphertext. Generate one with:  openssl rand -base64 32
//
// Wire format (all base64, dot-separated):  v1.<iv>.<authTag>.<ciphertext>
// The version prefix lets us rotate the algorithm/key later without ambiguity.

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit nonce, recommended for GCM
const KEY_LENGTH = 32 // 256-bit key
const VERSION = 'v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = process.env.TOKEN_ENC_KEY
  if (!raw) {
    throw new Error(
      'TOKEN_ENC_KEY is not set. Generate one with `openssl rand -base64 32` and ' +
        'store it as a secret env var before handling production banking data.'
    )
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENC_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). ` +
        'Generate a valid key with `openssl rand -base64 32`.'
    )
  }

  cachedKey = key
  return key
}

/** Encrypt a plaintext secret for storage at rest. Returns an opaque versioned string. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.')
}

/** Decrypt a value produced by encrypt(). Throws if the payload was tampered with. */
export function decrypt(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unrecognized ciphertext format or unsupported version.')
  }

  const [, ivB64, authTagB64, ciphertextB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
