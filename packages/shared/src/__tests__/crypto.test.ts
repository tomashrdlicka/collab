import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { encryptToken, decryptToken } from '../crypto'
import * as crypto from 'crypto'

// Generate a valid AES-256 key (32 bytes, base64-encoded)
const TEST_KEY = crypto.randomBytes(32).toString('base64')

describe('crypto', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY
  })

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY
  })

  describe('encryptToken', () => {
    it('returns a Buffer', () => {
      const result = encryptToken('my-secret-token')
      expect(Buffer.isBuffer(result)).toBe(true)
    })

    it('produces output longer than 32 bytes (iv + authTag + content)', () => {
      const result = encryptToken('test')
      // 16 bytes IV + 16 bytes auth tag + at least 1 byte content
      expect(result.length).toBeGreaterThan(32)
    })

    it('produces different ciphertext for the same input (random IV)', () => {
      const result1 = encryptToken('same-token')
      const result2 = encryptToken('same-token')
      expect(result1.equals(result2)).toBe(false)
    })

    it('handles empty string', () => {
      const encrypted = encryptToken('')
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe('')
    })

    it('handles long tokens', () => {
      const longToken = 'a'.repeat(10000)
      const encrypted = encryptToken(longToken)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(longToken)
    })

    it('handles unicode characters', () => {
      const unicodeToken = 'ghp_token_\u2603_\u{1F600}'
      const encrypted = encryptToken(unicodeToken)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(unicodeToken)
    })

    it('throws when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY
      expect(() => encryptToken('test')).toThrow('ENCRYPTION_KEY not set')
    })
  })

  describe('decryptToken', () => {
    it('correctly round-trips a token', () => {
      const original = 'ghp_abcdef1234567890'
      const encrypted = encryptToken(original)
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(original)
    })

    it('throws when ENCRYPTION_KEY is not set', () => {
      const encrypted = encryptToken('test')
      delete process.env.ENCRYPTION_KEY
      expect(() => decryptToken(encrypted)).toThrow('ENCRYPTION_KEY not set')
    })

    it('throws on tampered ciphertext (auth tag integrity)', () => {
      const encrypted = encryptToken('test-token')
      // Tamper with the encrypted content (after IV + authTag)
      encrypted[33] = (encrypted[33]! + 1) % 256
      expect(() => decryptToken(encrypted)).toThrow()
    })

    it('throws on tampered auth tag', () => {
      const encrypted = encryptToken('test-token')
      // Tamper with auth tag (bytes 16-32)
      encrypted[20] = (encrypted[20]! + 1) % 256
      expect(() => decryptToken(encrypted)).toThrow()
    })

    it('throws on tampered IV', () => {
      const encrypted = encryptToken('test-token')
      // Tamper with IV (bytes 0-16)
      encrypted[5] = (encrypted[5]! + 1) % 256
      expect(() => decryptToken(encrypted)).toThrow()
    })

    it('fails with a different encryption key', () => {
      const encrypted = encryptToken('secret-data')
      // Use a different key for decryption
      process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
      expect(() => decryptToken(encrypted)).toThrow()
    })
  })

  describe('round-trip edge cases', () => {
    it('handles special characters', () => {
      const tokens = [
        'ghp_ABCdef123!@#$%^&*()',
        'token with spaces',
        'token\nwith\nnewlines',
        'token\twith\ttabs',
        JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } }),
      ]

      for (const token of tokens) {
        const encrypted = encryptToken(token)
        const decrypted = decryptToken(encrypted)
        expect(decrypted).toBe(token)
      }
    })
  })
})
