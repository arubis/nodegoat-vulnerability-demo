# Revised Two-Phase Approach: Structured Sequential Prompting

## Key Finding
The Claude Code SDK's `query()` function doesn't support interactive back-and-forth. The `maxTurns` parameter allows Claude to take multiple autonomous turns, but we can't inject new prompts mid-conversation.

## Revised Solution: Structured Sequential Instructions

### Option 1: Single Query with Phased Instructions (Recommended)
Structure the prompt to guide Claude through phases sequentially:

```typescript
const structuredPrompt = `
You are a security expert fixing vulnerabilities. You MUST complete this task in TWO distinct phases:

## PHASE 1: FILE EDITING (MANDATORY - DO THIS FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Locate the vulnerability: ${issueContext.title}
2. Use Edit or MultiEdit tools to fix the vulnerable code
3. After editing, use Read tool to verify your changes were applied
4. Say "PHASE 1 COMPLETE: Files have been edited" when done

⚠️ IMPORTANT: You MUST complete Phase 1 before proceeding to Phase 2.
Do NOT skip directly to providing JSON.

## PHASE 2: JSON SUMMARY (ONLY AFTER PHASE 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only after you've confirmed "PHASE 1 COMPLETE", provide the JSON summary:

\`\`\`json
{
  "title": "Fix [vulnerability] in [component]",
  "description": "Detailed explanation",
  "files": [
    {
      "path": "path/to/edited/file.js",
      "changes": "Complete file content after edits"
    }
  ],
  "tests": ["Test descriptions"]
}
\`\`\`

## Execution Checklist:
□ Used Edit/MultiEdit tools
□ Verified changes with Read tool
□ Stated "PHASE 1 COMPLETE"
□ Provided JSON summary

Remember: Edit files FIRST, then provide JSON. Do not provide JSON without editing.
`;
```

### Option 2: Two Separate Query Calls
Make two independent calls, but this loses context:

```typescript
// First query - edit files
const editResult = await query({
  prompt: editingPrompt,
  options: { maxTurns: 20 }
});

// Second query - generate JSON
const jsonResult = await query({
  prompt: jsonGenerationPrompt + contextFromFirstQuery,
  options: { maxTurns: 10 }
});
```

### Option 3: Checkpoint-Based Approach
Use explicit checkpoints that Claude must acknowledge:

```typescript
const checkpointPrompt = `
Complete these steps in order:

CHECKPOINT 1: Analyze the vulnerability
- Find the vulnerable code
- Say "CHECKPOINT 1 REACHED: Found vulnerability at [location]"

CHECKPOINT 2: Edit the files
- Use Edit tools to fix the issue
- Say "CHECKPOINT 2 REACHED: Edited [X] files"

CHECKPOINT 3: Verify changes
- Use Read tool to confirm edits
- Say "CHECKPOINT 3 REACHED: Changes verified"

CHECKPOINT 4: Generate JSON
- Only after all checkpoints, provide the JSON summary
- Say "CHECKPOINT 4 REACHED: JSON generated"
`;
```

## Implementation Plan

### 1. Update Prompt Construction
```typescript
class GitBasedClaudeCodeAdapter {
  protected constructPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): string {
    if (this.claudeConfig.useStructuredPhases) {
      return this.constructStructuredPhasedPrompt(issueContext, analysis);
    }
    // Fall back to original prompt
    return super.constructPrompt(issueContext, analysis, enhancedPrompt);
  }
  
  private constructStructuredPhasedPrompt(
    issueContext: IssueContext,
    analysis: IssueAnalysis
  ): string {
    // Build the structured prompt with clear phase separation
  }
}
```

### 2. Enhanced Response Parsing
```typescript
private parsePhaseCompletion(messages: SDKMessage[]): PhaseStatus {
  const phase1Complete = messages.some(m => 
    m.text?.includes('PHASE 1 COMPLETE')
  );
  
  const filesEdited = messages.some(m =>
    m.type === 'tool_use' && m.name === 'Edit'
  );
  
  const jsonProvided = messages.some(m =>
    m.text?.includes('```json')
  );
  
  return {
    phase1Complete,
    filesEdited,
    jsonProvided,
    success: phase1Complete && filesEdited && jsonProvided
  };
}
```

### 3. Validation Logic
```typescript
async generateSolutionWithGit(
  issueContext: IssueContext,
  analysis: IssueAnalysis
): Promise<GitSolutionResult> {
  // Execute with structured prompt
  const messages = await this.executeStructuredQuery(issueContext, analysis);
  
  // Validate phase completion
  const phaseStatus = this.parsePhaseCompletion(messages);
  
  if (!phaseStatus.filesEdited) {
    return {
      success: false,
      error: 'Phase 1 failed: No files were edited'
    };
  }
  
  if (!phaseStatus.jsonProvided) {
    return {
      success: false,
      error: 'Phase 2 failed: No JSON summary provided'
    };
  }
  
  // Extract and return results
  return this.extractResults(messages);
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('Structured Phased Prompting', () => {
  it('should include phase markers in prompt', () => {
    const prompt = adapter.constructStructuredPhasedPrompt(issue, analysis);
    expect(prompt).toContain('PHASE 1: FILE EDITING');
    expect(prompt).toContain('PHASE 2: JSON SUMMARY');
  });
  
  it('should detect phase completion markers', () => {
    const messages = [
      { text: 'PHASE 1 COMPLETE: Files have been edited' },
      { type: 'tool_use', name: 'Edit' },
      { text: '```json\n{...}\n```' }
    ];
    
    const status = adapter.parsePhaseCompletion(messages);
    expect(status.phase1Complete).toBe(true);
    expect(status.filesEdited).toBe(true);
    expect(status.jsonProvided).toBe(true);
  });
});
```

### Integration Tests
- Test with actual Claude Code SDK
- Verify files are actually modified
- Ensure JSON references edited files
- Measure success rates

## Metrics to Track
1. **Phase Completion Rates**
   - % where Phase 1 completes (files edited)
   - % where Phase 2 completes (JSON provided)
   - % where both phases complete successfully

2. **Quality Metrics**
   - Files edited matches files in JSON
   - JSON accurately describes changes
   - Git diff confirms actual modifications

3. **Performance Metrics**
   - Time to Phase 1 completion
   - Time to Phase 2 completion
   - Total execution time
   - Token usage

## Rollback Plan
If structured prompting doesn't improve success rates:
1. Keep tracking metrics for analysis
2. Fall back to current single-prompt approach
3. Consider alternative solutions (separate API endpoints, different SDK)

## Configuration
```yaml
claudeCodeConfig:
  useStructuredPhases: true
  phaseValidation: strict
  requirePhaseMarkers: true
  maxTurns: 30
```

## Expected Improvements
- **Current**: ~0% files actually edited
- **Target**: 70%+ files edited before JSON generation
- **Stretch Goal**: 90%+ complete both phases successfully