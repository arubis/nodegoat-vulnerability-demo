#!/usr/bin/env bun

/**
 * Test for RFC-047: jQuery XXE False Positive
 * Reproduces issue #322 where XXE was detected in jQuery minified file
 */

import { VendorDetectionIntegration } from './src/vendor/index.js';

const JQUERY_XXE_VULNERABILITY = {
  type: 'XXE',
  file: 'app/assets/vendor/jquery.min.js',
  severity: 'HIGH' as const,
  line: 1337,
  description: 'XML External Entity vulnerability detected',
  issueNumber: 322
};

const OTHER_VENDOR_CASES = [
  {
    type: 'XSS',
    file: 'node_modules/bootstrap/dist/js/bootstrap.min.js',
    severity: 'MEDIUM' as const,
    description: 'Cross-site scripting vulnerability'
  },
  {
    type: 'PROTOTYPE_POLLUTION',
    file: 'bower_components/lodash/lodash.min.js',
    severity: 'HIGH' as const,
    description: 'Prototype pollution vulnerability'
  },
  {
    type: 'SQL_INJECTION',
    file: 'app/controllers/user_controller.js',
    severity: 'CRITICAL' as const,
    description: 'SQL injection in user input handling'
  }
];

async function test() {
  console.log('🧪 RFC-047 jQuery False Positive Test\n');
  console.log('='.repeat(60));
  
  const integration = new VendorDetectionIntegration();
  const results = [];
  
  // Test 1: jQuery XXE (Issue #322)
  console.log('\n📋 Test 1: jQuery XXE False Positive (Issue #322)');
  console.log('-'.repeat(40));
  
  const jqueryResult = await integration.processVulnerability(JQUERY_XXE_VULNERABILITY);
  
  console.log(`  File: ${JQUERY_XXE_VULNERABILITY.file}`);
  console.log(`  Detected as: ${jqueryResult.type}`);
  console.log(`  Action: ${jqueryResult.action}`);
  console.log(`  Should patch: ${jqueryResult.shouldPatch || false}`);
  console.log(`  Should NOT patch: ${jqueryResult.shouldNotPatch || false}`);
  
  if (jqueryResult.library) {
    console.log(`  Library: ${jqueryResult.library.name} v${jqueryResult.library.version}`);
  }
  
  if (jqueryResult.recommendation) {
    console.log(`  Recommended version: ${jqueryResult.recommendation.minimumSafeVersion}`);
    console.log(`  Update command: ${jqueryResult.recommendation.updateStrategies[0]?.command}`);
  }
  
  results.push({
    test: 'jQuery XXE',
    success: jqueryResult.type === 'vendor' && jqueryResult.shouldNotPatch === true,
    type: jqueryResult.type,
    shouldNotPatch: jqueryResult.shouldNotPatch
  });
  
  // Test 2: Other vendor libraries
  console.log('\n📋 Test 2: Other Vendor Libraries');
  console.log('-'.repeat(40));
  
  for (const vuln of OTHER_VENDOR_CASES) {
    const result = await integration.processVulnerability(vuln);
    const isVendor = await integration.isVendorFile(vuln.file);
    const shouldPatch = !isVendor; // Don't patch vendor files
    
    console.log(`  ${vuln.file}:`);
    console.log(`    Type: ${result.type}, Should patch: ${shouldPatch}`);
    
    results.push({
      test: vuln.file,
      success: (result.type === 'vendor') === (vuln.file.includes('node_modules') || 
               vuln.file.includes('bower_components') ||
               vuln.file.includes('vendor')),
      type: result.type,
      shouldPatch
    });
  }
  
  // Test 3: Issue creation for vendor vulnerabilities
  console.log('\n📋 Test 3: Issue Creation Preview');
  console.log('-'.repeat(40));
  
  if (jqueryResult.issue) {
    console.log(`  Title: ${jqueryResult.issue.title}`);
    console.log(`  Labels: ${jqueryResult.issue.labels.join(', ')}`);
    console.log(`  Creates PR: ${jqueryResult.issue.createsPR}`);
    console.log('\n  Body preview:');
    const bodyLines = jqueryResult.issue.body.split('\n').slice(0, 10);
    bodyLines.forEach((line: string) => console.log(`    ${line}`));
    console.log('    ...');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY\n');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success rate: ${((successful / results.length) * 100).toFixed(1)}%`);
  
  console.log('\n🔍 Key Validations:');
  console.log(`  1. jQuery not patched: ${results[0]?.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  2. Vendor libraries detected: ${results.filter(r => r.type === 'vendor').length} of ${OTHER_VENDOR_CASES.filter(c => c.file.includes('node_modules') || c.file.includes('bower') || c.file.includes('vendor')).length}`);
  console.log(`  3. Application code can be patched: ${results.find(r => r.test.includes('controller'))?.shouldPatch ? '✅ PASS' : '❌ FAIL'}`);
  
  console.log('\n✨ RFC-047 jQuery Test Complete!\n');
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(console.error);