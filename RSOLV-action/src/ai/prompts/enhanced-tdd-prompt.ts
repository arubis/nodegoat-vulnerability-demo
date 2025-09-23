/**
 * Enhanced TDD-focused prompts for Claude Code
 * Incorporates best practices from community and recent Claude Code features
 */

export interface TDDPromptOptions {
  vulnerabilityType: string;
  fileType: string;
  issueContext: any;
  analysis: any;
  testResults?: any;
  validationResult?: any;
  iteration?: { current: number; max: number };
  maxIterations?: number;
}

/**
 * Create a TDD-focused prompt that guides Claude through red-green-refactor
 */
export function createTDDPrompt(options: TDDPromptOptions): string {
  const { vulnerabilityType, fileType, issueContext, analysis } = options;
  
  // Special handling for Pug templates
  if (fileType === 'pug') {
    return createPugSpecificPrompt(options);
  }
  
  return `You are an expert security engineer using strict TDD methodology to fix vulnerabilities.

## 🚨 CRITICAL: Follow TDD Red-Green-Refactor Cycle EXACTLY 🚨

## Issue to Fix:
${issueContext.title}
${issueContext.body}

## TDD PHASE 1: RED - Write a Failing Test (Conceptually)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before making ANY changes, understand what test WOULD prove the vulnerability:

1. Use Read tool to examine the vulnerable code
2. Identify the exact attack vector (e.g., '<script>alert("XSS")</script>')
3. Document how you would test that this attack works BEFORE the fix

Say: "RED PHASE: I understand the vulnerability - [describe attack vector]"

## TDD PHASE 2: GREEN - Make the Test Pass (Fix the Vulnerability)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Now implement the MINIMAL fix to prevent the vulnerability:

1. Use Edit or MultiEdit to fix ONLY the vulnerable code
2. Make the smallest change that blocks the attack
3. Do NOT add extra features or improvements

After editing, say: "GREEN PHASE: Applied minimal fix - [describe the fix]"

## TDD PHASE 3: REFACTOR - Maintain Quality
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ensure the fix doesn't break existing functionality:

1. Use Read to verify your changes are correct
2. Check that legitimate use cases still work
3. Clean up code ONLY if necessary for the fix

Say: "REFACTOR PHASE: Verified no regressions"

## PHASE 4: Provide Test-Validated Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After completing ALL phases, provide this JSON:

\`\`\`json
{
  "title": "Fix ${vulnerabilityType} vulnerability using TDD",
  "description": "TDD cycle complete: RED (identified vulnerability), GREEN (applied fix), REFACTOR (verified quality)",
  "files": [
    {
      "path": "exact/path/to/file",
      "changes": "COMPLETE file content after fix (use Read tool to get it)"
    }
  ],
  "tests": [
    "RED: Attack vector '${getExampleAttack(vulnerabilityType)}' is blocked after fix",
    "GREEN: Fix correctly ${getFixDescription(vulnerabilityType)}",
    "REFACTOR: Legitimate functionality remains intact"
  ]
}
\`\`\`

⚠️ IMPORTANT: Complete each phase before moving to the next. Say the phase completion message.`;
}

/**
 * Special prompt for Pug template vulnerabilities
 */
function createPugSpecificPrompt(options: TDDPromptOptions): string {
  const { issueContext } = options;
  
  return `You are fixing an XSS vulnerability in a Pug template using TDD methodology.

## Issue:
${issueContext.body}

## 🎯 CRITICAL: Pug Template XSS Fix Pattern
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In Pug templates, XSS vulnerabilities occur when using unescaped output:
- \`!=\` renders UNESCAPED HTML (VULNERABLE)
- \`=\` renders ESCAPED HTML (SAFE)

## TDD PHASE 1: RED - Identify the Vulnerability
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Use Read to find the \`!=\` operator in the Pug file
2. Confirm this is where user content is rendered unsafely
3. Say: "RED: Found unescaped output with != operator at [location]"

## TDD PHASE 2: GREEN - Apply the Fix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Use Edit to change \`!=\` to \`=\`
2. Make ONLY this change, nothing else
3. Say: "GREEN: Changed != to = for HTML escaping"

## TDD PHASE 3: REFACTOR - Verify
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Use Read to confirm the change was applied
2. Verify no other code was affected
3. Say: "REFACTOR: Verified fix with no side effects"

## PHASE 4: Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`json
{
  "title": "Fix XSS in Pug template",
  "description": "Changed unescaped output (!=) to escaped output (=) to prevent XSS",
  "files": [
    {
      "path": "[pug file path]",
      "changes": "[complete file content - use Read to get it]"
    }
  ],
  "tests": [
    "RED: Script tags like '<script>alert(\"XSS\")</script>' are now escaped as &lt;script&gt;",
    "GREEN: The = operator properly escapes all HTML entities",
    "REFACTOR: Normal text content displays correctly (escaped but visible)"
  ]
}
\`\`\`

⚠️ Remember: The ONLY change needed is != to =. Focus on this single, critical fix.`;
}

/**
 * Enhanced retry prompt when validation fails
 */
export function createTDDRetryPrompt(options: TDDPromptOptions): string {
  const { iteration, maxIterations, validationResult, vulnerabilityType } = options;
  
  return `## ❌ Validation Failed - Attempt ${iteration?.current}/${iteration?.max}

The automated tests show your fix didn't work correctly:
${validationResult?.error || 'Tests did not pass'}

## Common TDD Mistakes to Fix:

1. **Skipped RED phase**: Did you understand the vulnerability first?
2. **Over-implementation**: Did you add more than the minimal fix?
3. **Incomplete fix**: Did you fix ALL instances of the vulnerability?
4. **Wrong fix pattern**: Are you using the correct security pattern?

## Try Again with Strict TDD:

### STEP 1: Revert and Restart
Use Read to see the CURRENT state (it may have your failed fix)

### STEP 2: RED Phase - Understand
What EXACTLY makes this code vulnerable?
- For XSS: Where does user input get rendered unsafely?
- For SQL Injection: Where are queries built with concatenation?

### STEP 3: GREEN Phase - Minimal Fix
Apply ONLY the security fix:
- XSS: Escape output (e.g., != to = in Pug)
- SQL Injection: Use parameterized queries
- Path Traversal: Validate and sanitize paths

### STEP 4: REFACTOR Phase - Verify
Ensure functionality still works after your fix

## The test is checking:
${getTestExpectation(vulnerabilityType)}

Focus on making THIS specific test pass, nothing more.`;
}

/**
 * Helper functions for vulnerability-specific guidance
 */
function getExampleAttack(vulnerabilityType: string): string {
  const attacks: Record<string, string> = {
    'XSS': '<script>alert("XSS")</script>',
    'SQL Injection': "' OR '1'='1",
    'Command Injection': '; cat /etc/passwd',
    'Path Traversal': '../../../etc/passwd',
    'SSRF': 'http://internal-server/admin',
    'XXE': '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
    'Insecure Deserialization': '{"__proto__":{"isAdmin":true}}'
  };
  return attacks[vulnerabilityType] || 'malicious input';
}

function getFixDescription(vulnerabilityType: string): string {
  const fixes: Record<string, string> = {
    'XSS': 'escapes HTML entities (<, >, &, ", \')',
    'SQL Injection': 'uses parameterized queries instead of concatenation',
    'Command Injection': 'validates and escapes shell arguments',
    'Path Traversal': 'validates paths stay within allowed directory',
    'SSRF': 'validates URLs against allowlist',
    'XXE': 'disables external entity processing',
    'Insecure Deserialization': 'validates object structure before processing'
  };
  return fixes[vulnerabilityType] || 'prevents the vulnerability';
}

function getTestExpectation(vulnerabilityType: string): string {
  const expectations: Record<string, string> = {
    'XSS': 'Script tags should be escaped as &lt;script&gt; not executed as JavaScript',
    'SQL Injection': 'Malicious SQL should be treated as data, not executed as queries',
    'Command Injection': 'Shell metacharacters should be escaped or rejected',
    'Path Traversal': 'Paths outside allowed directory should be rejected',
    'SSRF': 'Requests to internal/private IPs should be blocked',
    'XXE': 'External entities should not be processed',
    'Insecure Deserialization': 'Prototype pollution attempts should be rejected'
  };
  return expectations[vulnerabilityType] || 'The vulnerability should be prevented';
}