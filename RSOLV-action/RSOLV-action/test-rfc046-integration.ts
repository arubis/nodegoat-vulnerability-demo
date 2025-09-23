#!/usr/bin/env bun

/**
 * Integration test for RFC-046: Multi-file Vulnerability Chunking
 */

import { ChunkingIntegration } from './src/chunking/index.js';

const DOS_VULNERABILITY = {
  type: 'DENIAL_OF_SERVICE',
  issueNumber: 325,
  severity: 'HIGH',
  files: [
    { path: 'app/routes/index.js', lines: [45, 89, 123], severity: 'HIGH' },
    { path: 'app/routes/contributions.js', lines: [23], severity: 'HIGH' },
    { path: 'app/routes/admin.js', lines: [67, 91], severity: 'CRITICAL' },
    { path: 'app/routes/profile.js', lines: [34], severity: 'MEDIUM' },
    { path: 'app/views/index.html', lines: [12], severity: 'LOW' },
    { path: 'app/views/contributions.html', lines: [45], severity: 'LOW' },
    { path: 'app/views/admin.html', lines: [78], severity: 'MEDIUM' },
    { path: 'app/views/profile.html', lines: [90], severity: 'LOW' },
    { path: 'app/data/user-dao.js', lines: [234, 456], severity: 'HIGH' },
    { path: 'app/data/allocations-dao.js', lines: [123], severity: 'MEDIUM' },
    { path: 'app/data/benefits-dao.js', lines: [89], severity: 'MEDIUM' },
    { path: 'server.js', lines: [45], severity: 'CRITICAL' },
    { path: 'config/config.js', lines: [12], severity: 'HIGH' },
    { path: 'test/e2e.js', lines: [567], severity: 'LOW' }
  ]
};

async function test() {
  console.log('🧪 RFC-046 Integration Test\n');
  console.log('='.repeat(60));
  
  const integration = new ChunkingIntegration();
  
  console.log('\n📋 Processing DoS vulnerability with 14 files...');
  const result = await integration.processWithChunking(DOS_VULNERABILITY, 325);
  
  console.log(`\n✅ Results:`);
  console.log(`  Chunked: ${result.chunked}`);
  console.log(`  Chunks created: ${result.chunks}`);
  console.log(`  PRs generated: ${result.prs?.length}`);
  console.log(`  Complexity: ${result.complexity}`);
  
  if (result.prs) {
    console.log('\n📝 PR Series:');
    result.prs.forEach((pr: { title: string; files: Array<{ path: string }> }, i: number) => {
      console.log(`  ${i + 1}. ${pr.title}`);
      console.log(`     Files: ${pr.files.map((f: { path: string }) => f.path).join(', ')}`);
    });
  }
  
  // Validate results
  const success = result.chunks === 5 && result.prs?.length === 5;
  console.log(`\n${success ? '✅' : '❌'} Test ${success ? 'PASSED' : 'FAILED'}`);
  console.log(`  Expected: 5 chunks, 5 PRs`);
  console.log(`  Got: ${result.chunks} chunks, ${result.prs?.length} PRs`);
  
  process.exit(success ? 0 : 1);
}

test().catch(console.error);