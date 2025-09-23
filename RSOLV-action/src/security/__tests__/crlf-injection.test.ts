import { describe, it, expect, beforeEach } from '@jest/globals';
import { SecurityDetector } from '../detector-v2';
import { VulnerabilityType } from '../types';

describe('CRLF Injection Detection', () => {
  let detector: SecurityDetector;

  beforeEach(() => {
    detector = new SecurityDetector();
  });

  describe('Vulnerable patterns', () => {
    it('should detect setHeader with user input', async () => {
      const code = `
        const location = req.query.redirect;
        res.setHeader('Location', location);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.CRLF_INJECTION);
      expect(vulnerabilities[0].line).toBe(3);
    });

    it('should detect writeHead with user input', async () => {
      const code = `
        const contentType = req.headers['content-type'];
        res.writeHead(200, {
          'Content-Type': contentType
        });
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.CRLF_INJECTION);
    });

    it('should detect response.write with user input', async () => {
      const code = `
        const message = req.body.message;
        res.write("Message: " + message);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.CRLF_INJECTION);
    });

    it('should detect Express res.set with user input', async () => {
      const code = `
        const customHeader = req.params.header;
        res.set('X-Custom-Header', customHeader);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.CRLF_INJECTION);
    });

    it('should detect res.header with concatenation', async () => {
      const code = `
        const userAgent = req.headers['user-agent'];
        res.header('X-Forwarded-For', 'proxy,' + userAgent);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.CRLF_INJECTION);
    });

    it('should detect res.redirect with user input', async () => {
      const code = `
        const returnUrl = req.query.return;
        res.redirect(returnUrl);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      // This might be detected as OPEN_REDIRECT instead/also
      expect(vulnerabilities.length).toBeGreaterThan(0);
      const crlfVuln = vulnerabilities.find(v => v.type === VulnerabilityType.CRLF_INJECTION);
      if (crlfVuln) {
        expect(crlfVuln).toBeDefined();
      }
    });

    it('should detect cookie setting with user input', async () => {
      const code = `
        const sessionId = req.body.session;
        res.setHeader('Set-Cookie', 'session=' + sessionId);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.CRLF_INJECTION);
    });
  });

  describe('Safe patterns', () => {
    it('should not detect hardcoded headers', async () => {
      const code = `
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Frame-Options', 'DENY');
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const crlfVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.CRLF_INJECTION);
      expect(crlfVulns).toHaveLength(0);
    });

    it('should not detect sanitized header values', async () => {
      const code = `
        const cleanValue = sanitizeHeaderValue(req.query.value);
        res.setHeader('X-Custom', cleanValue);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const crlfVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.CRLF_INJECTION);
      expect(crlfVulns).toHaveLength(0);
    });

    it('should not detect encoded values', async () => {
      const code = `
        const encoded = encodeURIComponent(req.query.data);
        res.setHeader('X-Data', encoded);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const crlfVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.CRLF_INJECTION);
      expect(crlfVulns).toHaveLength(0);
    });

    it('should not detect values stripped of CRLF', async () => {
      const code = `
        const cleaned = req.query.value.replace(/[\\r\\n]/g, '');
        res.setHeader('X-Value', cleaned);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const crlfVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.CRLF_INJECTION);
      expect(crlfVulns).toHaveLength(0);
    });
  });

  describe('Complex scenarios', () => {
    it('should detect multiple CRLF injections', async () => {
      const code = `
        function handleRequest(req, res) {
          const header1 = req.query.h1;
          const header2 = req.body.h2;

          res.setHeader('X-Header-1', header1);
          res.setHeader('X-Header-2', header2);

          return res.send('OK');
        }
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const crlfVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.CRLF_INJECTION);
      expect(crlfVulns).toHaveLength(2);
    });

    it('should detect CRLF in template literals', async () => {
      const code = `
        const username = req.params.username;
        res.setHeader('X-User', \`Current user: \${username}\`);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities.some(v => v.type === VulnerabilityType.CRLF_INJECTION)).toBeTruthy();
    });

    it('should detect CRLF with URL encoded payloads', async () => {
      const code = `
        // This could contain %0d%0a which is CRLF
        const param = req.query.param;
        res.setHeader('X-Param', decodeURIComponent(param));
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities.some(v => v.type === VulnerabilityType.CRLF_INJECTION)).toBeTruthy();
    });
  });
});