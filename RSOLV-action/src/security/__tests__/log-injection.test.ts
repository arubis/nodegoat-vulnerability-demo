import { describe, it, expect, beforeEach } from '@jest/globals';
import { SecurityDetector } from '../detector-v2';
import { VulnerabilityType } from '../types';

describe('Log Injection Detection', () => {
  let detector: SecurityDetector;

  beforeEach(() => {
    detector = new SecurityDetector();
  });

  describe('Vulnerable patterns', () => {
    it('should detect console.log with string concatenation', async () => {
      const code = `
        const userInput = req.query.name;
        console.log("User logged in: " + userInput);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.LOG_INJECTION);
      expect(vulnerabilities[0].line).toBe(3);
    });

    it('should detect console.error with template literal', async () => {
      const code = `
        const userId = req.params.id;
        console.error(\`Failed to load user: \${userId}\`);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.LOG_INJECTION);
    });

    it('should detect logger.info with user input', async () => {
      const code = `
        const username = request.body.username;
        logger.info('Login attempt from: ' + username);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.LOG_INJECTION);
    });

    it('should detect winston.log with concatenation', async () => {
      const code = `
        const action = req.query.action;
        winston.log('info', 'User action: ' + action);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.LOG_INJECTION);
    });

    it('should detect process.stdout.write with user input', async () => {
      const code = `
        const message = req.body.message;
        process.stdout.write("Message received: " + message + "\\n");
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.LOG_INJECTION);
    });

    it('should detect fs.appendFile logging with user input', async () => {
      const code = `
        const userAgent = req.headers['user-agent'];
        fs.appendFile('access.log', 'Request from: ' + userAgent + '\\n', (err) => {});
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities).toHaveLength(1);
      expect(vulnerabilities[0].type).toBe(VulnerabilityType.LOG_INJECTION);
    });
  });

  describe('Safe patterns', () => {
    it('should not detect hardcoded log messages', async () => {
      const code = `
        console.log("Application started successfully");
        logger.info('Server listening on port 3000');
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const logInjectionVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.LOG_INJECTION);
      expect(logInjectionVulns).toHaveLength(0);
    });

    it('should not detect sanitized input in logs', async () => {
      const code = `
        const username = sanitize(req.body.username);
        console.log(\`User logged in: \${username}\`);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const logInjectionVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.LOG_INJECTION);
      expect(logInjectionVulns).toHaveLength(0);
    });

    it('should not detect JSON stringified input', async () => {
      const code = `
        const userInput = req.query.data;
        console.log("Received data:", JSON.stringify(userInput));
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const logInjectionVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.LOG_INJECTION);
      expect(logInjectionVulns).toHaveLength(0);
    });

    it('should not detect escaped input', async () => {
      const code = `
        const message = escapeLogMessage(req.body.message);
        logger.info(\`Message: \${message}\`);
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const logInjectionVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.LOG_INJECTION);
      expect(logInjectionVulns).toHaveLength(0);
    });
  });

  describe('Complex scenarios', () => {
    it('should detect multiple log injections in same file', async () => {
      const code = `
        function handleRequest(req, res) {
          const username = req.body.username;
          const action = req.query.action;

          console.log("User " + username + " performed action");
          logger.info(\`Action: \${action} by user: \${username}\`);

          return res.json({ success: true });
        }
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      const logInjectionVulns = vulnerabilities.filter(v => v.type === VulnerabilityType.LOG_INJECTION);
      expect(logInjectionVulns).toHaveLength(2);
    });

    it('should detect log injection in error handlers', async () => {
      const code = `
        app.use((err, req, res, next) => {
          const errorMessage = err.message;
          console.error(\`Error occurred: \${errorMessage}\`);
          res.status(500).send('Internal Server Error');
        });
      `;

      const vulnerabilities = await detector.detectInFile(code, 'test.js');
      expect(vulnerabilities.some(v => v.type === VulnerabilityType.LOG_INJECTION)).toBeTruthy();
    });
  });
});