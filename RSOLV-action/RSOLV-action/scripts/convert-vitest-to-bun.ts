#!/usr/bin/env bun
/**
 * Convert Vitest tests to Bun test format
 */
import { readFileSync, writeFileSync } from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: bun run convert-vitest-to-bun.ts <test-file-path>');
  process.exit(1);
}

console.log(`Converting ${filePath} from Vitest to Bun...`);

let content = readFileSync(filePath, 'utf-8');

// Replace imports
content = content.replace(
  /import \{ ([^}]+) \} from ['"]vitest['"]/g,
  "import { $1 } from 'bun:test'"
);

// Replace vi.fn() with mock()
content = content.replace(/vi\.fn\(\)/g, 'mock(() => {})');
content = content.replace(/vi\.fn\(([^)]+)\)/g, 'mock($1)');

// Replace vi.clearAllMocks() with mock.restore()
content = content.replace(/vi\.clearAllMocks\(\)/g, 'mock.restore()');

// Replace vi.mocked with just the reference
content = content.replace(/vi\.mocked\(([^)]+)\)/g, '$1');

// Replace mockResolvedValueOnce with our mock pattern
content = content.replace(
  /\(global\.fetch as any\)\.mockResolvedValueOnce\(/g,
  'fetchMock.mockResponseOnce('
);

// Replace mockRejectedValueOnce
content = content.replace(
  /\(global\.fetch as any\)\.mockRejectedValueOnce\(/g,
  'fetchMock.mockErrorOnce('
);

// Add fetchMock setup if global.fetch is used
if (content.includes('global.fetch') && !content.includes('setupFetchMock')) {
  // Add import
  const importMatch = content.match(/import .* from ['"]bun:test['"]/);
  if (importMatch) {
    content = content.replace(
      importMatch[0],
      `${importMatch[0]}\nimport { setupFetchMock } from '../../../test-helpers/simple-mocks';`
    );
  }
  
  // Add fetchMock variable
  content = content.replace(
    /describe\([^{]+\{/,
    (match) => `${match}\n  let fetchMock: ReturnType<typeof setupFetchMock>;\n  let originalFetch: typeof fetch;`
  );
  
  // Update beforeEach
  content = content.replace(
    /beforeEach\(\(\) => \{/g,
    `beforeEach(() => {\n    originalFetch = global.fetch;\n    fetchMock = setupFetchMock();`
  );
  
  // Add afterEach if not present
  if (!content.includes('afterEach')) {
    content = content.replace(
      /beforeEach\([^}]+\}\);/g,
      (match) => `${match}\n\n  afterEach(() => {\n    global.fetch = originalFetch;\n    mock.restore();\n  });`
    );
  }
}

// Replace expect(global.fetch) patterns
content = content.replace(
  /expect\(global\.fetch\)/g,
  'expect(fetchMock.mock.mock.calls.length).toBeGreaterThan(0);\n      expect(fetchMock.mock.mock.calls[0][0])'
);

// Write the converted file
writeFileSync(filePath, content);
console.log(`✅ Converted ${filePath} to Bun test format`);