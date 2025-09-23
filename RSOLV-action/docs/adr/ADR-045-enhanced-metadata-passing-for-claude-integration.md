# ADR-045: Enhanced Metadata Passing for Claude Code Integration

## Status
Accepted

## Context
The RSOLV system uses a three-phase architecture (SCAN → VALIDATE → MITIGATE) where the VALIDATE phase enriches issues with specific vulnerability details including file paths, line numbers, and remediation suggestions. This structured data needs to be communicated to Claude Code during the MITIGATE phase to enable precise, targeted fixes.

We evaluated three approaches for backend communication with Claude Code CLI:
1. **Direct CLI Configuration**: Using CLI flags and options
2. **Hybrid Approach**: Combining CLI for file operations with prompts for guidance
3. **Enhanced Metadata Passing**: Passing structured metadata that gets converted to prompts

### Key Requirements
- Must access customer's checked-out code directly
- Should be self-contained (no customer package management)
- Must preserve `specificVulnerabilities` data through retry attempts
- Should allow Claude to verify fixes by running tests
- Must work with GitHub Actions runners (Linux, Windows, macOS)

### Constraints
- Docker container actions isolate from checked-out code
- CLI installation would require customer package management
- Current Node.js action has direct repository access
- Must maintain backward compatibility with existing workflows

## Decision
We will use **Enhanced Metadata Passing** (Option 3) as our architecture for Claude Code integration.

### Implementation Details
```typescript
// Structured metadata from VALIDATE phase
interface SpecificVulnerability {
  file: string;
  line: number;
  message: string;
  snippet: string;
  remediation: string;
  confidence: 'high' | 'medium' | 'low';
}

// Enhanced issue context passed to MITIGATE
interface EnhancedIssueContext extends IssueContext {
  specificVulnerabilities: SpecificVulnerability[];
  validationData: ValidationData;
}

// Convert to focused prompt for Claude
function constructPromptFromMetadata(metadata: EnhancedIssueContext): string {
  // Transform structured data into directive prompt
  return `
## SPECIFIC VULNERABILITIES TO FIX
${formatVulnerabilities(metadata.specificVulnerabilities)}

## TEST EXECUTION CAPABILITY
You can run: ${metadata.testCommand}

## CONSTRAINTS
- NEVER modify test files
- Fix ONLY the listed vulnerabilities
- Verify fixes with provided tests
`;
}
```

### Data Flow
1. **VALIDATE phase** → Creates structured vulnerability data
2. **PhaseDataClient** → Stores and retrieves validation results
3. **MITIGATE phase** → Enhances issue with `specificVulnerabilities`
4. **Claude adapter** → Converts metadata to directive prompts
5. **Claude Code** → Edits files, runs tests, commits changes
6. **Git** → Captures changes for PR creation

## Consequences

### Positive
- **Self-contained deployment**: No customer package management required
- **Structured data flow**: Clean separation between data and presentation
- **Iterative capability**: Claude can run tests and adjust fixes
- **Preservation through retries**: Data maintained across multiple attempts
- **Cross-platform compatibility**: Works on all GitHub Actions runners
- **Direct repository access**: Can edit files and run tests in place

### Negative
- **Prompt engineering complexity**: Must carefully construct prompts from metadata
- **Free-form responses**: Must parse git commits/diffs rather than structured JSON
- **Token usage**: Detailed prompts may use more tokens
- **Debugging difficulty**: Harder to debug prompt construction issues

### Neutral
- Maintains existing Node.js action architecture
- Compatible with current GitHub Actions workflows
- Uses existing Claude Code SDK capabilities
- No changes required to customer workflows

## Implementation Status

### Completed (v3.7.2)
- ✅ Data flow from VALIDATE to MITIGATE phases
- ✅ Preservation of `specificVulnerabilities` through retries
- ✅ Enhanced prompt construction with vulnerability details
- ✅ Debug logging for data flow tracing
- ✅ TDD tests for data flow validation

### Remaining
- ⏳ Verification that prompts include vulnerability details in production
- ⏳ End-to-end testing with real vulnerabilities
- ⏳ Metrics collection on fix success rates

## Alternatives Considered

### Option 1: Direct CLI Configuration
**Rejected because**:
- Requires customer package management
- Docker containers isolate from code
- No unique CLI flags for our requirements
- Would need system prompts anyway

### Option 2: Hybrid Approach
**Rejected because**:
- More complex implementation
- State management between CLI calls difficult
- Potential for prompt/CLI conflicts
- No clear advantages over Option 3

## Related Documents
- ADR-012: Git-Based In-Place Editing
- ADR-041: Three-Phase Architecture
- RFC-044: Phase Data Persistence
- Integration Testing Plan (2025-08-18)

## Review Notes
*Date: 2025-08-18*
- Reviewed Claude Code CLI documentation (latest as of August 2025)
- Analyzed 30+ sources on Claude Code capabilities
- Tested data flow with debug logging
- Confirmed preservation through retry attempts

## Decision Makers
- Engineering Team (implementation feasibility)
- DevOps Team (deployment considerations)
- Security Team (credential vending approval)

## References
- [Claude Code SDK Documentation](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [Claude Code CLI Reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- GitHub Actions Runner Specifications
- RSOLV Platform Architecture Documentation