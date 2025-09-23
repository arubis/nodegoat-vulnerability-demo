import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  ConfidenceLevel, 
  ValidationResult,
  calculateConfidenceLevel,
  getValidationStrategy,
  VALIDATION_STRATEGIES
} from '../types';

describe('RFC-045: Validation Confidence Scoring', () => {
  describe('Confidence Level Calculation', () => {
    it('should calculate HIGH confidence for scores >= 0.8', () => {
      expect(calculateConfidenceLevel(0.8)).toBe(ConfidenceLevel.HIGH);
      expect(calculateConfidenceLevel(0.9)).toBe(ConfidenceLevel.HIGH);
      expect(calculateConfidenceLevel(1.0)).toBe(ConfidenceLevel.HIGH);
    });

    it('should calculate MEDIUM confidence for scores 0.5-0.79', () => {
      expect(calculateConfidenceLevel(0.5)).toBe(ConfidenceLevel.MEDIUM);
      expect(calculateConfidenceLevel(0.6)).toBe(ConfidenceLevel.MEDIUM);
      expect(calculateConfidenceLevel(0.79)).toBe(ConfidenceLevel.MEDIUM);
    });

    it('should calculate LOW confidence for scores 0.2-0.49', () => {
      expect(calculateConfidenceLevel(0.2)).toBe(ConfidenceLevel.LOW);
      expect(calculateConfidenceLevel(0.3)).toBe(ConfidenceLevel.LOW);
      expect(calculateConfidenceLevel(0.49)).toBe(ConfidenceLevel.LOW);
    });

    it('should calculate REVIEW confidence for scores < 0.2', () => {
      expect(calculateConfidenceLevel(0.0)).toBe(ConfidenceLevel.REVIEW);
      expect(calculateConfidenceLevel(0.1)).toBe(ConfidenceLevel.REVIEW);
      expect(calculateConfidenceLevel(0.19)).toBe(ConfidenceLevel.REVIEW);
    });
  });

  describe('Validation Strategy Selection', () => {
    it('should return correct strategy for COMMAND_INJECTION', () => {
      const strategy = getValidationStrategy('COMMAND_INJECTION');
      expect(strategy.weights.pattern).toBe(0.3);
      expect(strategy.weights.ast).toBe(0.4);
      expect(strategy.weights.dataFlow).toBe(0.3);
      expect(strategy.requiredMethods).toContain('dataFlow');
    });

    it('should return correct strategy for XSS variants', () => {
      const strategy1 = getValidationStrategy('XSS');
      const strategy2 = getValidationStrategy('Cross-Site-Scripting');
      
      expect(strategy1.weights.context).toBe(0.3);
      expect(strategy2.weights.context).toBe(0.3);
      expect(strategy1.requiredMethods).toContain('context');
    });

    it('should return DEFAULT strategy for unknown types', () => {
      const strategy = getValidationStrategy('UNKNOWN_VULNERABILITY');
      expect(strategy).toEqual(VALIDATION_STRATEGIES.DEFAULT);
    });
  });

  describe('EnhancedValidationEnricher (failing tests)', () => {
    it('should return confidence scores instead of binary validation', async () => {
      // This test SHOULD FAIL - EnhancedValidationEnricher doesn't exist yet
      const { EnhancedValidationEnricher } = await import('../enricher');
      const enricher = new EnhancedValidationEnricher('token', 'api-key');
      
      const issue = {
        number: 320,
        title: 'Command injection vulnerability',
        body: 'Command injection in Gruntfile.js',
        labels: ['security', 'rsolv:detected']
      };

      const result = await enricher.enrichIssue(issue);
      
      // These assertions define what we want to build
      expect(result.overallConfidence).toBeDefined();
      expect(result.validationMetadata).toBeDefined();
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
    });

    it('should never return 0 vulnerabilities if scan found any', async () => {
      // This test SHOULD FAIL - functionality doesn't exist yet
      const { EnhancedValidationEnricher } = await import('../enricher');
      const enricher = new EnhancedValidationEnricher('token', 'api-key');
      
      const issue = {
        number: 320,
        title: 'Command injection vulnerability',
        body: `## Security Vulnerability Report
        
        **Type**: Command_injection
        **Severity**: CRITICAL
        
        ### Affected Files
        
        #### \`Gruntfile.js\`
        - **Line 165**: Using exec with user input`,
        labels: ['security', 'rsolv:detected']
      };

      const result = await enricher.enrichIssue(issue);
      
      // MUST NOT return empty vulnerabilities
      expect(result.vulnerabilities).toBeDefined();
      expect(result.vulnerabilities.length).toBeGreaterThan(0);
      expect(result.hasSpecificVulnerabilities).toBe(true);
    });

    it('should process command injection without synthetic data workaround', async () => {
      // This test SHOULD FAIL - this is what we're fixing
      const { EnhancedValidationEnricher } = await import('../enricher');
      const enricher = new EnhancedValidationEnricher('token', 'api-key');
      
      const issue = {
        number: 320,
        title: '🔒 Command_injection vulnerabilities found',
        body: 'Command injection at line 165',
        labels: ['security', 'rsolv:detected', 'rsolv:validated']
      };

      const result = await enricher.enrichIssue(issue);
      
      // Should work without needing synthetic data
      expect(result.hasSpecificVulnerabilities).toBe(true);
      expect(result.vulnerabilities[0].type).toBe('COMMAND_INJECTION');
      expect([ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM]).toContain(
        result.overallConfidence
      );
    });
  });
});