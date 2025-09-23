#!/usr/bin/env bun

/**
 * Integration test for RFC implementations
 * Tests that all three RFCs are properly wired into the phase executor
 */

import { describe, it, expect } from 'vitest';
import { PhaseExecutor } from './src/modes/phase-executor/index.js';
import { ChunkingIntegration } from './src/chunking/index.js';
import { VendorDetectionIntegration } from './src/vendor/index.js';

describe('RFC Integration Tests', () => {
  it('RFC-045: EnhancedValidationEnricher is integrated', async () => {
    // Check that the phase executor imports and uses EnhancedValidationEnricher
    const code = await Bun.file('./src/modes/phase-executor/index.ts').text();
    expect(code).toContain('EnhancedValidationEnricher');
    expect(code).toContain("import('../../validation/enricher.js')");
    console.log('✅ RFC-045: Confidence scoring is integrated');
  });

  it('RFC-046: ChunkingIntegration is wired in', async () => {
    // Check that chunking is imported and used
    const code = await Bun.file('./src/modes/phase-executor/index.ts').text();
    expect(code).toContain('ChunkingIntegration');
    expect(code).toContain("import('../../chunking/index.js')");
    expect(code).toContain('shouldChunk');
    expect(code).toContain('processWithChunking');
    
    // Verify the chunking integration exists and has required methods
    const integration = new ChunkingIntegration();
    expect(integration.shouldChunk).toBeDefined();
    expect(integration.processWithChunking).toBeDefined();
    console.log('✅ RFC-046: Chunking is integrated');
  });

  it('RFC-047: VendorDetectionIntegration is wired in', async () => {
    // Check that vendor detection is imported and used
    const code = await Bun.file('./src/modes/phase-executor/index.ts').text();
    expect(code).toContain('VendorDetectionIntegration');
    expect(code).toContain("import('../../vendor/index.js')");
    expect(code).toContain('isVendorFile');
    expect(code).toContain('Vendor files detected');
    
    // Verify the vendor integration exists and has required methods
    const integration = new VendorDetectionIntegration();
    expect(integration.isVendorFile).toBeDefined();
    expect(integration.processVulnerability).toBeDefined();
    console.log('✅ RFC-047: Vendor detection is integrated');
  });

  it('All RFC implementations can be instantiated', async () => {
    // Test that all classes can be created without errors
    const testConfig = {
      apiKey: 'test-key',
      rsolvApiKey: 'test-key',
      configPath: './test-config',
      issueLabel: 'rsolv:automate',
      aiProvider: { provider: 'anthropic', model: 'claude-3' },
      containerConfig: { useContainer: false },
      securitySettings: { 
        enableSecurityReview: false,
        enablePreCommitCheck: false,
        enableRuntimeSandbox: false
      }
    };
    const executor = new PhaseExecutor(testConfig as any);
    
    const chunking = new ChunkingIntegration();
    const vendor = new VendorDetectionIntegration();
    
    expect(executor).toBeDefined();
    expect(chunking).toBeDefined();
    expect(vendor).toBeDefined();
    console.log('✅ All RFC implementations can be instantiated');
  });

  it('RFC-046: Should chunk multi-file vulnerabilities', () => {
    const chunking = new ChunkingIntegration();
    
    // Test with 14 files (like DoS vulnerability)
    const multiFileVuln = {
      files: Array(14).fill('file.js'),
      vulnerabilities: [{ type: 'DoS' }]
    };
    
    const shouldChunk = chunking.shouldChunk(multiFileVuln);
    expect(shouldChunk).toBe(true);
    console.log('✅ RFC-046: Correctly identifies 14-file vulnerability for chunking');
  });

  it('RFC-047: Should detect vendor files', async () => {
    const vendor = new VendorDetectionIntegration();
    
    // Test vendor file detection
    const isJQueryVendor = await vendor.isVendorFile('app/assets/vendor/jquery.min.js');
    const isNodeModulesVendor = await vendor.isVendorFile('node_modules/express/index.js');
    const isAppFile = await vendor.isVendorFile('app/routes/index.js');
    
    expect(isJQueryVendor).toBe(true);
    expect(isNodeModulesVendor).toBe(true);
    expect(isAppFile).toBe(false);
    console.log('✅ RFC-047: Correctly identifies vendor vs application files');
  });
});

// Run the tests
console.log('🔬 Testing RFC Integrations...\n');
console.log('Expected improvements:');
console.log('- RFC-045: Command injection returns confidence scores (not 0 vulnerabilities)');
console.log('- RFC-046: 14-file DoS chunks into multiple PRs');
console.log('- RFC-047: jQuery vendor files not patched\n');