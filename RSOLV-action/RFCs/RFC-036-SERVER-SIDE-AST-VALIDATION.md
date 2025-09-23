# RFC-036: Server-Side AST Validation Before Issue Creation

**Status**: Proposed
**Created**: 2025-07-01
**Author**: RSOLV Team

## Summary

Implement server-side AST validation for detected vulnerabilities before creating GitHub issues to reduce false positives and improve accuracy.

## Motivation

Currently, RSOLV-action detects vulnerabilities using regex patterns and creates issues immediately. This can lead to false positives when regex patterns match code that is actually safe due to context. By adding server-side AST validation before issue creation, we can:

1. Reduce false positives by ~70-90%
2. Improve developer trust in automated security scanning
3. Reduce noise in issue trackers
4. Better utilize AST patterns already available in RSOLV-api

## Design

### Architecture Overview

```
RSOLV-action                    RSOLV-api
    |                               |
    |-- 1. Regex Detection -->      |
    |                               |
    |-- 2. Send for Validation -->  |
    |                               |-- 3. AST Analysis
    |<-- 4. Validated Results ---   |
    |                               |
    |-- 5. Create Issues -->        |
```

### Implementation Plan

#### Phase 1: API Endpoint (RSOLV-api)

Create validation endpoint:
```
POST /api/v1/vulnerabilities/validate
{
  "vulnerabilities": [
    {
      "id": "uuid",
      "patternId": "js-eval-injection",
      "filePath": "app/routes/contributions.js",
      "line": 32,
      "code": "const preTax = eval(req.body.preTax);",
      "severity": "critical"
    }
  ],
  "files": {
    "app/routes/contributions.js": "full file content..."
  }
}

Response:
{
  "validated": [
    {
      "id": "uuid",
      "isValid": true,
      "confidence": 0.95,
      "astContext": {
        "inUserInputFlow": true,
        "hasValidation": false
      }
    }
  ],
  "stats": {
    "total": 1,
    "validated": 1,
    "rejected": 0
  }
}
```

#### Phase 2: Action Integration (RSOLV-action)

1. **Create AST Validator Service**
```typescript
// src/scanner/ast-validator.ts
import { RsolvApiClient } from '../api/client.js';
import { Vulnerability } from '../security/types.js';

export interface ValidationResult {
  vulnerability: Vulnerability;
  isValid: boolean;
  confidence: number;
  reason?: string;
}

export class ASTValidator {
  private apiClient: RsolvApiClient;
  private cache: Map<string, ValidationResult> = new Map();
  
  constructor(apiKey: string) {
    this.apiClient = new RsolvApiClient({ apiKey });
  }
  
  async validateVulnerabilities(
    vulnerabilities: Vulnerability[],
    fileContents: Map<string, string>
  ): Promise<Vulnerability[]> {
    // Group by file for efficiency
    const vulnsByFile = this.groupByFile(vulnerabilities);
    
    // Validate in batches
    const validated: Vulnerability[] = [];
    for (const [filePath, fileVulns] of vulnsByFile) {
      const results = await this.validateBatch(fileVulns, filePath, fileContents.get(filePath));
      validated.push(...results);
    }
    
    return validated;
  }
  
  private async validateBatch(
    vulnerabilities: Vulnerability[],
    filePath: string,
    content?: string
  ): Promise<Vulnerability[]> {
    if (!content) return vulnerabilities; // No content, can't validate
    
    try {
      const response = await this.apiClient.validateVulnerabilities({
        vulnerabilities: vulnerabilities.map(v => ({
          id: v.id,
          patternId: v.patternId,
          filePath: v.filePath,
          line: v.line,
          code: v.code,
          severity: v.severity
        })),
        files: { [filePath]: content }
      });
      
      // Return only validated vulnerabilities
      return vulnerabilities.filter(vuln => {
        const validation = response.validated.find(v => v.id === vuln.id);
        return validation?.isValid === true;
      });
    } catch (error) {
      logger.warn(`AST validation failed for ${filePath}, using regex results`, error);
      return vulnerabilities; // Fallback to regex results
    }
  }
}
```

2. **Modify Repository Scanner**
```typescript
// In repository-scanner.ts, after line 46
if (config.enableASTValidation && config.rsolvApiKey) {
  logger.info('Performing AST validation on detected vulnerabilities...');
  const validator = new ASTValidator(config.rsolvApiKey);
  
  // Create file contents map
  const fileContents = new Map<string, string>();
  files.forEach(f => fileContents.set(f.path, f.content));
  
  const preValidationCount = vulnerabilities.length;
  vulnerabilities = await validator.validateVulnerabilities(vulnerabilities, fileContents);
  const filtered = preValidationCount - vulnerabilities.length;
  
  logger.info(`AST validation complete: ${filtered} false positives filtered out`);
}
```

3. **Update Configuration**
```typescript
// In types.ts
export interface ScanConfig {
  // ... existing fields
  enableASTValidation?: boolean;
  astValidationBatchSize?: number;
  rsolvApiKey?: string; // Needed for validation API
}
```

#### Phase 3: Optimization & Monitoring

1. **Caching Strategy**
   - Cache validation results by file hash + pattern ID
   - TTL: 24 hours
   - Clear cache on file changes

2. **Performance Optimizations**
   - Batch vulnerabilities by file (max 10 files per request)
   - Parallel validation for large repositories
   - Timeout: 30s per validation request
   - Circuit breaker for API failures

3. **Metrics Collection**
   - Track false positive reduction rate
   - Monitor validation API response times
   - Log validation failures for debugging

### Configuration

Add to action.yml:
```yaml
enable_ast_validation:
  description: 'Enable server-side AST validation for detected vulnerabilities'
  required: false
  default: 'true'
ast_validation_batch_size:
  description: 'Number of files to validate per API request'
  required: false
  default: '10'
```

### Testing Strategy

1. **Unit Tests**
   - Mock AST validator with known results
   - Test batching logic
   - Test cache behavior
   - Test fallback on API failure

2. **Integration Tests**
   - Test with real eval() vulnerabilities
   - Test false positive scenarios:
     - eval() in comments
     - eval() with hardcoded strings
     - eval() with validated input
   - Measure performance impact

3. **E2E Tests**
   - Run scan on NodeGoat with/without AST validation
   - Compare issue counts
   - Verify no true positives are filtered

### Rollout Plan

1. **Phase 1**: Deploy API endpoint (1 day)
2. **Phase 2**: Implement in RSOLV-action behind feature flag (2 days)
3. **Phase 3**: Test with select repositories (1 day)
4. **Phase 4**: Enable by default for all customers (1 day)

### Success Metrics

- False positive reduction: >70%
- Scan time increase: <20%
- API availability: >99.9%
- Zero true positives filtered out

### Security Considerations

- File contents are sent to RSOLV-api for validation
- Use HTTPS for all API communication
- Implement request signing for authenticity
- Rate limit validation requests
- Sanitize file contents in logs

### Future Enhancements

1. **Confidence Scores**: Return confidence scores with issues
2. **Context Explanations**: Explain why a vulnerability was validated/rejected
3. **Custom Rules**: Allow customers to define custom AST validation rules
4. **IDE Integration**: Validate vulnerabilities in real-time during development

## Implementation Notes

- Start with JavaScript/TypeScript support (most common)
- Reuse existing AST infrastructure from pattern detection
- Consider using tree-sitter for multi-language support
- Monitor memory usage for large file analysis

## References

- ADR-007: Pattern Storage Architecture
- RFC-031: Elixir AST Service
- RFC-008: Pattern Serving API