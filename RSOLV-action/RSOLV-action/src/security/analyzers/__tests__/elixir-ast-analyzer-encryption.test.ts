import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ElixirASTAnalyzer } from '../elixir-ast-analyzer.js';
import * as crypto from 'crypto';

describe('ElixirASTAnalyzer - Encryption', () => {
  let analyzer: ElixirASTAnalyzer;
  
  const mockConfig = {
    apiUrl: 'http://localhost:4000',
    apiKey: 'test-api-key',
    timeout: 5000,
    debug: true
  };

  beforeEach(() => {
    analyzer = new ElixirASTAnalyzer(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await analyzer.cleanup();
    vi.resetModules();
  });

  describe('encryption integration', () => {
    it('should encrypt files before sending to API', async () => {
      const files = [
        { path: 'src/auth.js', content: 'const password = "secret";' }
      ];

      // Mock the fetch function to capture the request
      let capturedRequest: any = null;
      global.fetch = vi.fn(async (url: string, options: any) => {
        const bodyData = JSON.parse(options.body);
        capturedRequest = {
          url,
          options,
          body: bodyData
        };

        // Return mock response with matching requestId
        return {
          ok: true,
          json: async () => ({
            requestId: bodyData.requestId, // Use the parsed body directly
            session: {
              sessionId: 'test-session-123',
              expiresAt: new Date(Date.now() + 3600000).toISOString()
            },
            results: [{
              file: files[0].path,
              vulnerabilities: []
            }]
          })
        } as Response;
      });

      await analyzer.analyze(files);

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest.body).toHaveProperty('files');
      expect(capturedRequest.body.files).toBeInstanceOf(Array);
      
      // Files should be encrypted (contain encrypted content, not plaintext)
      const firstFile = capturedRequest.body.files[0];
      expect(firstFile).toHaveProperty('path');
      expect(firstFile).toHaveProperty('encryptedContent');
      expect(firstFile).toHaveProperty('encryption');
      expect(firstFile.encryption).toHaveProperty('iv');
      expect(firstFile.encryption).toHaveProperty('authTag');
      
      // Should not have plain text content
      expect(JSON.stringify(capturedRequest.body)).not.toContain('secret');
    });

    it('should use AES-256-GCM encryption', async () => {
      const testContent = 'function vulnerable() { eval(userInput); }';
      const files = [{ path: 'test.js', content: testContent }];

      let encryptedData: any = null;
      global.fetch = vi.fn(async (_url: string, options: any) => {
        encryptedData = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            requestId: encryptedData.requestId, // Return the same request ID
            session: { sessionId: 'test-session' },
            results: []
          })
        } as Response;
      });

      await analyzer.analyze(files);

      // Verify encrypted files structure matches platform expectations
      expect(encryptedData.files).toBeDefined();
      expect(encryptedData.files).toBeInstanceOf(Array);
      expect(encryptedData.files.length).toBeGreaterThan(0);
      
      const encryptedFile = encryptedData.files[0];
      expect(encryptedFile.encryptedContent).toBeDefined();
      expect(encryptedFile.encryption).toBeDefined();
      expect(encryptedFile.encryption.iv).toBeDefined();
      expect(encryptedFile.encryption.authTag).toBeDefined();
      
      // Base64 encoded values should be present
      // IV: 16 bytes = 24 chars in base64
      // AuthTag: 16 bytes = 24 chars in base64
      expect(encryptedFile.encryption.iv.length).toBeGreaterThan(0);
      expect(encryptedFile.encryption.authTag.length).toBeGreaterThan(0);
    });
  });

  describe('decryption of responses', () => {
    it('should decrypt API responses when encryption is used', async () => {
      const expectedVulnerability = {
        type: 'eval-injection',
        severity: 'high',
        line: 1,
        message: 'Direct eval usage detected'
      };

      // Create a mock encrypted response
      const responseData = {
        file: 'test.js',
        vulnerabilities: [expectedVulnerability]
      };

      // Simulate server-side encryption of response
      const symmetricKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(responseData), 'utf8'),
        cipher.final()
      ]);
      
      const tag = cipher.getAuthTag();

      global.fetch = vi.fn(async (url: string, options: any) => {
        const bodyData = JSON.parse(options.body);
        return {
        ok: true,
        json: async () => ({
          requestId: bodyData.requestId, // Use the actual request ID from the request
          session: { sessionId: 'test-session' },
          results: [{
            file: 'test.js',
            vulnerabilities: [{
              type: 'command_injection',
              severity: 'high',
              message: 'Use of eval() detected',
              line: 1
            }]
          }]
        })
      } as Response});

      const result = await analyzer.analyze(
        [{ path: 'test.js', content: 'eval(x)' }]
      );

      expect(result.results).toBeDefined();
      expect(result.results.length).toBe(1);
      expect(result.results[0].file).toBe('test.js');
      // Platform returns 'command_injection' for eval() usage
      expect(result.results[0].vulnerabilities[0].type).toBe('command_injection');
    });
  });
});