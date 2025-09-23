# Vitest Mocking Best Practices for RSOLV-Action

## Overview
This guide documents best practices for mocking in Vitest, specifically for the RSOLV-action test suite migration from Bun.

## Core Principles

### 1. Use vi.hoisted() for Shared Mock State
When you need to capture or share mock state across module boundaries, use `vi.hoisted()`:

```typescript
// ✅ GOOD - Hoisted mock state
const { mockCredentialManager } = vi.hoisted(() => {
  let manager: any = undefined;
  return {
    mockCredentialManager: {
      get: () => manager,
      set: (value: any) => { manager = value; }
    }
  };
});

vi.mock('../module.js', () => ({
  SomeClass: class {
    constructor(credentialManager: any) {
      mockCredentialManager.set(credentialManager);
    }
  }
}));

// ❌ BAD - Variable won't be available during module initialization
let mockCredentialManager: any;
vi.mock('../module.js', () => ({
  SomeClass: class {
    constructor(credentialManager: any) {
      mockCredentialManager = credentialManager; // Error: temporal dead zone
    }
  }
}));
```

### 2. Mock at Module Level, Not Instance Level
Mock entire modules rather than trying to spy on class methods after instantiation:

```typescript
// ✅ GOOD - Mock the entire module
vi.mock('../adapters/claude-code.js', () => ({
  ClaudeCodeAdapter: class {
    async generateSolution() {
      return { success: true };
    }
  }
}));

// ❌ BAD - Trying to spy on instance methods
const adapter = new ClaudeCodeAdapter();
vi.spyOn(adapter, 'generateSolution'); // May fail with undefined errors
```

### 3. Use Factory Functions for Complex Mocks
Create factory functions that return consistent mock implementations:

```typescript
// ✅ GOOD - Factory function for reusable mock
const createMockAdapter = () => ({
  generateSolution: vi.fn().mockResolvedValue({
    success: true,
    changes: {}
  }),
  analyzeIssue: vi.fn().mockResolvedValue({
    canBeFixed: true
  })
});

vi.mock('../adapters/ai-adapter.js', () => ({
  AIAdapter: vi.fn().mockImplementation(createMockAdapter)
}));
```

### 4. Mock Dynamic Imports at the Module Level
For dynamic imports, mock the modules they import rather than the import itself:

```typescript
// ✅ GOOD - Mock the module that will be dynamically imported
vi.mock('../credentials/singleton.js', () => ({
  CredentialManagerSingleton: {
    getInstance: vi.fn(async () => mockCredentialManager)
  }
}));

// In code:
const { CredentialManagerSingleton } = await import('../credentials/singleton.js');

// ❌ BAD - Trying to mock the dynamic import directly
vi.mock('import', () => ({
  default: vi.fn() // Won't work as expected
}));
```

### 5. Clean Mock State in beforeEach/afterEach
Always clean up mock state between tests to prevent test pollution:

```typescript
// ✅ GOOD - Clean state using setter functions
beforeEach(() => {
  mockCredentialManager.set(undefined);
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.TEST_VAR;
  mockCredentialManager.set(undefined);
});

// ❌ BAD - Direct assignment may not work with hoisted variables
beforeEach(() => {
  mockCredentialManager = undefined; // Won't affect hoisted closure
});
```

### 6. Mock Async Operations with Resolved Promises
Return resolved promises directly rather than using async/await in mocks:

```typescript
// ✅ GOOD - Return resolved promise directly
vi.mock('../api-client.js', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: 'test' })
}));

// ❌ LESS OPTIMAL - Unnecessary async/await
vi.mock('../api-client.js', () => ({
  fetchData: vi.fn(async () => {
    return { data: 'test' };
  })
}));
```

### 7. Use Correct Module Paths in Mocks
Mock modules at their import paths, not their file system paths:

```typescript
// ✅ GOOD - Use the same path as in imports
vi.mock('../adapters/claude-code.js', () => ({}));
// When the actual import is: import { ClaudeCodeAdapter } from '../adapters/claude-code.js';

// ❌ BAD - Using absolute paths when imports use relative
vi.mock('/home/user/project/src/adapters/claude-code.js', () => ({}));
```

## Common Patterns

### Pattern 1: Mocking Singleton Classes
```typescript
const { capturedInstance } = vi.hoisted(() => {
  let instance: any;
  return {
    capturedInstance: {
      get: () => instance,
      set: (val: any) => { instance = val; }
    }
  };
});

vi.mock('../singleton.js', () => ({
  MySingleton: {
    getInstance: vi.fn(() => {
      const instance = { 
        method: vi.fn() 
      };
      capturedInstance.set(instance);
      return instance;
    })
  }
}));
```

### Pattern 2: Mocking File System Operations
```typescript
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined)
}));
```

### Pattern 3: Mocking External API Clients
```typescript
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      issues: {
        get: vi.fn().mockResolvedValue({ data: mockIssue }),
        create: vi.fn().mockResolvedValue({ data: { number: 1 } })
      }
    }
  }))
}));
```

## Migration from Jest/Bun

### Key Differences
1. **Use `vi` instead of `jest`**: Replace all `jest.fn()` with `vi.fn()`
2. **Hoisting is required**: Use `vi.hoisted()` for variables needed during module initialization
3. **Mock reset behavior**: Vitest doesn't auto-reset mocks between tests by default
4. **Import extensions**: Always include `.js` extensions in mock paths

### Migration Checklist
- [ ] Replace all `jest` references with `vi`
- [ ] Add `vi.hoisted()` for shared mock state
- [ ] Add explicit `vi.clearAllMocks()` in beforeEach
- [ ] Update mock module paths to include `.js` extensions
- [ ] Replace custom matchers with standard ones or add to test setup

## Troubleshooting

### Issue: "Cannot spy on undefined"
**Solution**: Mock at module level instead of trying to spy on instance methods.

### Issue: "Variable is not defined" in mocks
**Solution**: Use `vi.hoisted()` to ensure variables are available during module initialization.

### Issue: Tests pass individually but fail together
**Solution**: Check for test pollution - ensure proper cleanup in afterEach hooks.

### Issue: Dynamic imports not being mocked
**Solution**: Mock the module being imported, not the import statement itself.

### Issue: Memory errors when running full test suite
**Solution**: Add NODE_OPTIONS to increase heap size:
```json
{
  "scripts": {
    "test": "NODE_OPTIONS='--max-old-space-size=8192' vitest run"
  }
}
```

## References
- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
- [Vi.hoisted Documentation](https://vitest.dev/api/vi.html#vi-hoisted)
- [Migration from Jest](https://vitest.dev/guide/migration.html#migrating-from-jest)