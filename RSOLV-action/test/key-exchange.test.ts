import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'crypto';

// RED Phase: Write failing tests for proper key exchange

describe('AST Service Key Exchange', () => {
  describe('Option 1: Diffie-Hellman Key Exchange (Most Secure)', () => {
    it('should establish shared secret using DH key exchange', () => {
      // Client generates DH key pair
      // Using smaller size for testing (512 bits) - DO NOT use in production!
      const client = crypto.createDiffieHellman(512);
      const clientPublicKey = client.generateKeys();
      
      // Server generates DH key pair
      const server = crypto.createDiffieHellman(client.getPrime(), client.getGenerator());
      const serverPublicKey = server.generateKeys();
      
      // Exchange public keys and compute shared secret
      const clientSharedSecret = client.computeSecret(serverPublicKey);
      const serverSharedSecret = server.computeSecret(clientPublicKey);
      
      // Both sides should have the same shared secret
      expect(clientSharedSecret.equals(serverSharedSecret)).toBe(true);
      
      // Derive AES key from shared secret
      const clientAESKey = crypto.createHash('sha256').update(clientSharedSecret).digest();
      const serverAESKey = crypto.createHash('sha256').update(serverSharedSecret).digest();
      
      expect(clientAESKey.equals(serverAESKey)).toBe(true);
      expect(clientAESKey.length).toBe(32); // 256 bits for AES-256
    });
  });

  describe('Option 2: ECDH Key Exchange (Modern & Efficient)', () => {
    it('should establish shared secret using ECDH', () => {
      // Using P-256 curve (NIST recommended)
      const clientECDH = crypto.createECDH('prime256v1');
      const clientPublicKey = clientECDH.generateKeys();
      
      const serverECDH = crypto.createECDH('prime256v1');
      const serverPublicKey = serverECDH.generateKeys();
      
      // Compute shared secrets
      const clientSharedSecret = clientECDH.computeSecret(serverPublicKey);
      const serverSharedSecret = serverECDH.computeSecret(clientPublicKey);
      
      expect(clientSharedSecret.equals(serverSharedSecret)).toBe(true);
      
      // Derive AES key using HKDF (more secure than simple hash)
      const salt = crypto.randomBytes(32);
      const info = Buffer.from('RSOLV-AST-v1');
      
      const clientAESKey = Buffer.from(crypto.hkdfSync('sha256', clientSharedSecret, salt, info, 32));
      const serverAESKey = Buffer.from(crypto.hkdfSync('sha256', serverSharedSecret, salt, info, 32));
      
      expect(clientAESKey.equals(serverAESKey)).toBe(true);
    });
  });

  describe('Option 3: Pre-shared Key with Secure Transport', () => {
    it('should use client-provided key over TLS (simplest secure option)', () => {
      // Client generates a secure random key
      const clientKey = crypto.randomBytes(32);
      
      // Client sends key in header over HTTPS (TLS provides transport security)
      const headers = {
        'X-Encryption-Key': clientKey.toString('base64')
      };
      
      // Server reads key from header
      const serverKey = Buffer.from(headers['X-Encryption-Key'], 'base64');
      
      expect(serverKey.equals(clientKey)).toBe(true);
      expect(serverKey.length).toBe(32);
      
      // Both use the same key for AES-256-GCM
      const testData = 'sensitive code';
      const iv = crypto.randomBytes(16);
      
      // Client encrypts
      const cipher = crypto.createCipheriv('aes-256-gcm', clientKey, iv);
      const encrypted = Buffer.concat([cipher.update(testData, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Server decrypts
      const decipher = crypto.createDecipheriv('aes-256-gcm', serverKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      
      expect(decrypted.toString('utf8')).toBe(testData);
    });
  });

  describe('Current Implementation Issues', () => {
    it('should fail when server uses different key than client', () => {
      const clientKey = crypto.randomBytes(32);
      const serverKey = crypto.randomBytes(32); // Different key!
      
      const testData = 'sensitive code';
      const iv = crypto.randomBytes(16);
      
      // Client encrypts with its key
      const cipher = crypto.createCipheriv('aes-256-gcm', clientKey, iv);
      const encrypted = Buffer.concat([cipher.update(testData, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Server tries to decrypt with different key
      const decipher = crypto.createDecipheriv('aes-256-gcm', serverKey, iv);
      decipher.setAuthTag(authTag);
      
      // This should throw an error
      expect(() => {
        decipher.update(encrypted);
        decipher.final();
      }).toThrow();
    });
  });
});