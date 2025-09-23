#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Script to fix mock isolation issues in all test files
 */

const TEST_FILE_PATTERNS = ['.test.ts', '.spec.ts', '_test.ts', '_spec.ts'];

async function findTestFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    // Skip node_modules and build directories
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
      continue;
    }
    
    if (entry.isDirectory()) {
      files.push(...await findTestFiles(fullPath));
    } else if (entry.isFile() && TEST_FILE_PATTERNS.some(pattern => entry.name.includes(pattern))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

async function fixTestFile(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, 'utf8');
  let modified = false;
  let newContent = content;
  
  // Check if file uses global.fetch mock
  if (content.includes('global.fetch =') && !content.includes('mock-isolation')) {
    console.log(`Fixing mock isolation in: ${filePath}`);
    
    // Add import for mock isolation
    const importStatement = `import { setupMockIsolation, cleanupMockIsolation, createIsolatedFetchMock } from '../../test-helpers/mock-isolation';\n`;
    
    // Find the right place to insert import (after other imports)
    const lastImportMatch = content.match(/import[^;]+;(?!.*import[^;]+;)/s);
    if (lastImportMatch) {
      const insertPos = lastImportMatch.index! + lastImportMatch[0].length;
      newContent = content.slice(0, insertPos) + '\n' + importStatement + content.slice(insertPos);
    }
    
    // Replace global.fetch = with isolated mock
    newContent = newContent.replace(/global\.fetch = ([^;]+);/g, 'const fetchMock = createIsolatedFetchMock();');
    
    // Add setup/cleanup in beforeEach/afterEach
    if (!newContent.includes('setupMockIsolation')) {
      // Find beforeEach
      const beforeEachMatch = newContent.match(/beforeEach\s*\(\s*(?:async\s*)?\(\)\s*=>\s*{/);
      if (beforeEachMatch) {
        const insertPos = beforeEachMatch.index! + beforeEachMatch[0].length;
        newContent = newContent.slice(0, insertPos) + '\n  setupMockIsolation();' + newContent.slice(insertPos);
      }
      
      // Find afterEach
      const afterEachMatch = newContent.match(/afterEach\s*\(\s*(?:async\s*)?\(\)\s*=>\s*{/);
      if (afterEachMatch) {
        const insertPos = afterEachMatch.index! + afterEachMatch[0].length;
        newContent = newContent.slice(0, insertPos) + '\n  cleanupMockIsolation();' + newContent.slice(insertPos);
      }
    }
    
    modified = true;
  }
  
  // Fix Vitest imports if using Bun
  if (content.includes("from 'vitest'") && content.includes('bun test')) {
    newContent = newContent.replace(/from 'vitest'/g, "from 'bun:test'");
    newContent = newContent.replace(/import { vi } from 'bun:test'/g, "import { mock } from 'bun:test'");
    newContent = newContent.replace(/vi\.fn/g, 'mock');
    newContent = newContent.replace(/vi\.clearAllMocks/g, 'mock.restore');
    modified = true;
  }
  
  if (modified) {
    await writeFile(filePath, newContent);
    return true;
  }
  
  return false;
}

async function main() {
  console.log('🔍 Finding test files...');
  const testFiles = await findTestFiles(process.cwd());
  console.log(`Found ${testFiles.length} test files`);
  
  let fixedCount = 0;
  for (const file of testFiles) {
    if (await fixTestFile(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✅ Fixed ${fixedCount} test files with mock isolation issues`);
  
  // Create a summary report
  const report = {
    totalFiles: testFiles.length,
    fixedFiles: fixedCount,
    timestamp: new Date().toISOString(),
    recommendations: [
      'Run "bun test" to verify all tests pass',
      'Consider running tests in isolation mode: "bun test --sequential"',
      'Review any remaining failures for manual fixes'
    ]
  };
  
  await writeFile('mock-fix-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Report saved to mock-fix-report.json');
}

main().catch(console.error);