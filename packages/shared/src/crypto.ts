import * as crypto from 'crypto'

/**
 * Encrypt a token for storage using AES-256-GCM
 */
export function encryptToken(token: string): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set')

  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    iv
  )

  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Combine iv + authTag + encrypted
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')])
}

/**
 * Decrypt a token from storage
 */
export function decryptToken(encrypted: Buffer): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set')

  const iv = encrypted.subarray(0, 16)
  const authTag = encrypted.subarray(16, 32)
  const content = encrypted.subarray(32)

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64'),
    iv
  )
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(content.toString('hex'), 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
