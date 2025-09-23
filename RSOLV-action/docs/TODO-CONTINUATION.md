# TODO: Three-Phase Architecture Continuation

## Context
Following the debugging session on 2025-08-14, these items remain to be completed.
See THREE-PHASE-DEBUGGING-SESSION-2025-08-14.md for full context.

## High Priority Tasks

### 1. Create Test with Actual Vulnerable Code in Repository
**Why**: Current tests use example code in issues, but validation only checks real files
**What to do**:
1. Create a test file in nodegoat-vulnerability-demo with actual SQL injection
2. Example: `test/vulnerable-example.js` with:
   ```javascript
   function getUserById(req, res) {
     const query = "SELECT * FROM users WHERE id = '" + req.params.id + "'";
     db.query(query, callback);
   }
   ```
3. Create issue referencing this actual file
4. Test that validation finds the vulnerability
5. Test that mitigation generates a fix

### 2. Verify AST Validation API Integration
**Why**: AST validation reduces false positives but wasn't fully tested
**What to do**:
1. Add test to verify `runASTValidation` is called when rsolvApiKey is present
2. Mock the API response and verify it affects confidence scores
3. Check the actual API endpoint: `${RSOLV_API_URL}/ast/validate`
4. Verify request format:
   ```json
   {
     "file": "path/to/file.js",
     "content": "file content",
     "vulnerabilityType": "sql-injection"
   }
   ```
5. Add integration test with real API if test key available

### 3. Test Credential Vending for AI Fix Generation
**Why**: Vended credentials allow GitHub Actions to use AI without storing keys
**What to do**:
1. Test with `useVendedCredentials: true` in config
2. Verify CredentialManagerSingleton is initialized
3. Test credential refresh logic
4. Verify AI calls use vended credentials
5. Test fallback when vending fails
6. Check timeout handling for credential requests

### 4. Clean Up Debug Logging
**Why**: Too much logging impacts performance and readability
**What to do**:
1. Review all logger.info calls added during debugging
2. Convert detailed step logging to debug level
3. Add environment variable for debug mode: `RSOLV_DEBUG=true`
4. Keep critical milestone logging at info level:
   - Phase transitions
   - Vulnerability detection counts
   - PR creation success/failure
5. Remove or conditionalize:
   - Step-by-step logging (Step 1-6)
   - Detailed object logging
   - Validation data structure dumps

### 5. Add Integration Tests for Full Three-Phase Flow
**Why**: Need end-to-end testing of SCAN → VALIDATE → MITIGATE
**What to do**:
1. Create test that:
   - Creates an issue with rsolv:detected label (SCAN output)
   - Runs VALIDATE phase
   - Verifies validation data is stored
   - Runs MITIGATE phase
   - Verifies PR is created
2. Test error scenarios:
   - No vulnerabilities found (false positive)
   - File doesn't exist
   - Invalid vulnerability type
   - API failures

### 6. Performance Optimization
**Why**: Timeouts were added but not optimized
**Current timeouts**:
- GitHub API: 30s
- Phase data retrieval: 15s
- Validation phase: 60s
- Overall mitigation: 5 minutes

**What to do**:
1. Profile actual operation times
2. Adjust timeouts based on real-world data
3. Add configurable timeouts via environment variables
4. Consider parallel operations where possible

### 7. Documentation Updates
**Why**: New three-phase architecture needs user documentation
**What to do**:
1. Update README.md with three-phase explanation
2. Add workflow examples for each phase
3. Document label requirements
4. Add troubleshooting guide
5. Create migration guide from old version

## Medium Priority Tasks

### 8. Add More Vulnerability Patterns
**Current patterns**: SQL injection, XSS, Command injection, NoSQL injection
**Add patterns for**:
- LDAP injection
- XML injection (XXE)
- Path traversal
- SSRF
- Insecure deserialization
- JWT vulnerabilities

### 9. Improve Pattern Accuracy
**Current issues**:
- SQL pattern is very broad (matches any string concatenation with SELECT)
- XSS pattern might have false positives
**What to do**:
1. Add negative lookahead for safe patterns
2. Consider context (is it actually executing SQL?)
3. Add severity scoring based on context

### 10. Add Metrics and Monitoring
**What to track**:
- Phase execution times
- Vulnerability detection rates
- False positive rates
- Fix success rates
- API call counts

## Low Priority Tasks

### 11. Refactor for Maintainability
- Extract timeout values to constants
- Create separate files for each phase executor
- Standardize error handling patterns
- Add more type safety

### 12. Add Caching
- Cache validation results for same commit
- Cache AST validation responses
- Cache file reads

## Testing Checklist
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual test with real repository
- [ ] Test with vended credentials
- [ ] Test without API key (fallback mode)
- [ ] Test with malformed issues
- [ ] Test with large files
- [ ] Test with multiple vulnerabilities
- [ ] Test timeout scenarios
- [ ] Test concurrent phase execution

## Release Checklist
- [ ] Remove debug logging
- [ ] Update version number
- [ ] Update CHANGELOG.md
- [ ] Run full test suite
- [ ] Test in staging environment
- [ ] Update documentation
- [ ] Create release notes
- [ ] Tag release
- [ ] Deploy to production

## Notes for Next Session
- The validation enricher is working correctly but only validates real files
- Test issues need to reference actual vulnerable code in the repository
- Consider creating a `test-vulnerabilities/` directory with known vulnerable code
- The three-phase architecture is solid but needs production hardening
- Credential vending is critical for customer adoption - prioritize testing