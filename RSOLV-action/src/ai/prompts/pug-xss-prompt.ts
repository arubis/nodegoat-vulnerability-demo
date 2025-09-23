/**
 * Specialized prompt for fixing XSS vulnerabilities in Pug templates
 */

export function createPugXSSPrompt(issueContext: any, analysis: any): string {
  return `You are an expert security engineer fixing an XSS vulnerability in a Pug template.

## Issue Details:
${issueContext.body}

## CRITICAL: Understanding Pug Template XSS

In Pug templates:
- \`!=\` renders UNESCAPED HTML (vulnerable to XSS)
- \`=\` renders ESCAPED HTML (safe from XSS)
- \`#{\}\` is escaped interpolation (safe)
- \`!{\}\` is unescaped interpolation (vulnerable)

## Your Task: Fix the XSS Vulnerability

### Step 1: Locate the Vulnerable Code
Use the Read tool to examine the Pug template file mentioned in the issue.
Look for uses of \`!=\` or \`!{\}\` which render unescaped content.

### Step 2: Apply the Fix
Use Edit or MultiEdit to change:
- \`!=\` to \`=\` (for direct output)
- \`!{\}\` to \`#{\}\` (for interpolation)

IMPORTANT: Make ONLY this change. Do not modify anything else.

### Step 3: Verify Your Fix
After editing, use Read to confirm your changes were applied correctly.

### Step 4: Provide Summary
After fixing, provide this JSON:

\`\`\`json
{
  "title": "Fix XSS vulnerability in Pug template",
  "description": "Changed unescaped output (!=) to escaped output (=) to prevent XSS attacks. This ensures user-provided content is properly HTML-escaped before rendering.",
  "files": [
    {
      "path": "[path to the .pug file]",
      "changes": "[Complete content of the fixed .pug file - use Read tool to get it]"
    }
  ],
  "tests": [
    "RED test: Verify that script tags like '<script>alert(\"XSS\")</script>' are escaped as '&lt;script&gt;alert(\"XSS\")&lt;/script&gt;' instead of executing",
    "GREEN test: Confirm that the = operator properly escapes HTML entities like <, >, &, \" and '",
    "REFACTOR test: Ensure legitimate HTML content is displayed correctly (escaped but visible to users)"
  ]
}
\`\`\`

## Example Fix:

BEFORE (vulnerable):
\`\`\`pug
div.content
  p!= userContent  // VULNERABLE: renders unescaped HTML
\`\`\`

AFTER (fixed):
\`\`\`pug
div.content
  p= userContent   // SAFE: renders escaped HTML
\`\`\`

Remember: The fix is simple - just change != to =. Focus on making this one critical change correctly.`;
}

/**
 * Enhanced prompt for retry attempts when validation fails
 */
export function createPugXSSRetryPrompt(
  issueContext: any,
  analysis: any,
  validationResult: any,
  iteration: number,
  maxIterations: number
): string {
  return `You are fixing an XSS vulnerability in a Pug template. Your previous fix attempt failed validation.

## Previous Attempt Failed (Attempt ${iteration}/${maxIterations})

${validationResult.error || 'The fix did not properly escape HTML content.'}

## Common Mistakes to Avoid:

1. **Incomplete Fix**: Make sure you changed ALL instances of \`!=\` to \`=\` in the vulnerable section
2. **Wrong Operator**: Ensure you're using \`=\` (single equals) not \`==\` or other variants
3. **File Not Saved**: After using Edit, verify with Read that changes were applied
4. **Wrong File**: Ensure you're editing the exact file mentioned in the issue

## Try Again:

1. Use Read to see the current state of the file
2. Find ALL instances of \`!=\` that handle user content
3. Use Edit or MultiEdit to change them to \`=\`
4. Use Read again to verify your changes
5. Provide the JSON summary with the complete fixed file content

Focus on this simple change: \`!=\` → \`=\`

The test is checking that content like '<script>alert("XSS")</script>' gets escaped to 
'&lt;script&gt;alert("XSS")&lt;/script&gt;' instead of executing as JavaScript.

Make sure your fix achieves this escaping behavior.`;
}