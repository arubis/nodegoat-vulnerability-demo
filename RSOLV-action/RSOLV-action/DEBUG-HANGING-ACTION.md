# GitHub Action Hanging Debug Analysis

## Issue Summary
The GitHub Action workflow is hanging after:
- API key validation passes
- Credential exchange attempts start  
- Processing 7 issues found

Expected runtime: 20-30 seconds
Actual runtime: 3+ minutes (hanging)

## Key Findings

### 1. Sequential Processing with Long Timeouts
- **Issue**: Processing issues sequentially in `unified-processor.ts` (line 51)
- **Each issue has**: 5-minute default timeout for Claude Code execution
- **Total potential runtime**: 7 issues × 5 minutes = 35 minutes maximum

### 2. Default Timeouts
- **AI Provider timeout**: 60 seconds (config default)
- **Claude Code timeout**: 300 seconds (5 minutes) in `claude-code.ts` line 114
- **Context gathering timeout**: 300 seconds in `unified-processor.ts` line 139

### 3. No Process-Level Timeout
- The main `index.ts` doesn't have an overall timeout
- Each issue is processed to completion before moving to the next
- No parallel processing of issues

### 4. Potential Blocking Points
1. **Claude Code execution** (`claude-code.ts` line 521-522):
   - Sets a 5-minute timeout per execution
   - Waits for child process to complete
   
2. **Credential exchange** (`credentials/manager.ts` line 44-53):
   - No explicit timeout on the fetch call
   - Could hang if API is unresponsive

3. **Issue processing loop** (`unified-processor.ts` line 51-72):
   - Sequential processing
   - No overall timeout
   - Errors are caught but processing continues

## Recommendations

### Quick Fix (Reduce Timeouts)
1. Reduce Claude Code timeout from 300s to 30s
2. Add timeout to credential exchange fetch calls
3. Add overall workflow timeout

### Better Fix (Parallel Processing)
1. Process issues in parallel with Promise.all()
2. Limit concurrency to avoid rate limits
3. Add circuit breaker for failing issues

### Code Changes Needed

#### 1. Add fetch timeout to credential manager:
```typescript
const response = await fetch(url, {
  signal: AbortSignal.timeout(30000), // 30 second timeout
  // ... other options
});
```

#### 2. Reduce Claude Code timeout:
```typescript
const timeout = this.claudeConfig.timeout ?? 30000; // 30 seconds instead of 5 minutes
```

#### 3. Add overall timeout to main workflow:
```typescript
const WORKFLOW_TIMEOUT = 120000; // 2 minutes total

const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Workflow timeout')), WORKFLOW_TIMEOUT);
});

await Promise.race([
  processIssues(issues, config, processingOptions),
  timeoutPromise
]);
```

#### 4. Process issues in parallel (with concurrency limit):
```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // Process max 3 issues at once

const results = await Promise.all(
  issues.map(issue => 
    limit(() => processIssue(issue, config, options, injectedDeps))
  )
);
```

## Immediate Action Items

1. **Check if Claude Code CLI is installed and responding**:
   - The adapter checks availability with 5s timeout
   - But execution has 5-minute timeout

2. **Add debug logging to see where it's stuck**:
   - Set `DEBUG=true` environment variable
   - Add more granular progress logging

3. **Consider failing fast**:
   - If first issue fails, skip remaining
   - Add retry limit per issue (currently has retries but might be stuck in retry loop)