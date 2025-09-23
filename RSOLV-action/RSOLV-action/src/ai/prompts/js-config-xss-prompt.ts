/**
 * Specialized prompt for fixing XSS vulnerabilities in JavaScript configuration files
 */

export function createJSConfigXSSPrompt(issueContext: any, analysis: any): string {
  return `You are an expert security engineer fixing an XSS vulnerability in a JavaScript configuration file.

## Issue Details:
${issueContext.body}

## Understanding the Vulnerability

This XSS vulnerability is in a JavaScript configuration file that uses document.write() to inject scripts dynamically. The issue is that user-controlled input (like location.host) could be manipulated to inject malicious scripts.

## Your Task: Fix the XSS Vulnerability

### Step 1: Examine the Vulnerable Code
Use the Read tool to examine config/env/development.js around line 11.
Look for the document.write() or innerHTML usage that creates the vulnerability.

### Step 2: Choose the Appropriate Fix

For livereload/development scripts, you have several options:

**Option A (SAFEST): Remove Dynamic Script Injection**
Replace the dynamic script with a static script tag or remove it entirely if it's only for development.

**Option B: Use Safe DOM Methods**
Instead of document.write with string concatenation, use createElement and appendChild:
\`\`\`javascript
environmentalScripts: [
  \`<script>
    (function() {
      var script = document.createElement('script');
      script.src = 'http://localhost:35729/livereload.js';
      document.body.appendChild(script);
    })();
  </script>\`
]
\`\`\`

**Option C: Validate and Sanitize**
If you must use the dynamic host, validate it against a whitelist:
\`\`\`javascript
environmentalScripts: [
  \`<script>
    (function() {
      var allowedHosts = ['localhost', '127.0.0.1', 'dev.example.com'];
      var host = (location.host || 'localhost').split(':')[0];
      if (allowedHosts.includes(host)) {
        var script = document.createElement('script');
        script.src = 'http://' + host + ':35729/livereload.js';
        document.body.appendChild(script);
      }
    })();
  </script>\`
]
\`\`\`

### Step 3: Apply Your Fix
Use Edit or MultiEdit to replace the vulnerable code with your chosen safe alternative.

### Step 4: Verify Your Fix
After editing, use Read to confirm your changes were applied correctly.

### Step 5: Provide Summary
After fixing, provide this JSON:

\`\`\`json
{
  "title": "Fix XSS vulnerability in development config",
  "description": "Replaced unsafe document.write() with innerHTML string concatenation with safe DOM manipulation methods to prevent XSS attacks. The livereload script is now injected safely without allowing user-controlled input to inject arbitrary scripts.",
  "files": [
    {
      "path": "config/env/development.js",
      "changes": "[Complete content of the fixed file - use Read tool to get it]"
    }
  ],
  "tests": [
    "RED test: Verify that manipulated location.host values cannot inject arbitrary scripts",
    "GREEN test: Confirm that scripts are created safely using DOM methods without string concatenation",
    "REFACTOR test: Ensure livereload functionality still works in development environment"
  ]
}
\`\`\`

## Important Notes:
- This is a development configuration, so the fix should maintain development functionality
- The safest approach is to avoid dynamic script injection entirely
- If dynamic behavior is needed, use DOM methods instead of string concatenation
- Never use document.write() or innerHTML with user-controlled input`;
}

/**
 * Enhanced prompt for retry attempts when JS config XSS validation fails
 */
export function createJSConfigXSSRetryPrompt(
  issueContext: any,
  analysis: any,
  validationResult: any,
  iteration: number,
  maxIterations: number
): string {
  return `You are fixing an XSS vulnerability in a JavaScript config file. Your previous fix attempt failed validation.

## Previous Attempt Failed (Attempt ${iteration}/${maxIterations})

${validationResult.error || 'The fix did not properly prevent XSS attacks.'}

## Common Mistakes to Avoid:

1. **Still using document.write()**: This is inherently unsafe with concatenated strings
2. **String concatenation with user input**: Even with "validation", string building is risky
3. **Incomplete fix**: Make sure you fixed the actual vulnerability, not just reformatted code
4. **Breaking functionality**: The livereload script should still work in development

## The Vulnerability You Must Fix:

The code uses document.write with string concatenation:
\`\`\`javascript
document.write("<script src='http://" + (location.host || "localhost").split(":")[0] + ":35729/livereload.js'></" + "script>");
\`\`\`

The problem: location.host can be manipulated by attackers to inject arbitrary scripts.

## Try This Specific Fix:

Replace the entire environmentalScripts array with a safe version:

\`\`\`javascript
environmentalScripts: [
  // Safe livereload injection without XSS vulnerability
  \`<script>
    (function() {
      var script = document.createElement('script');
      script.src = 'http://localhost:35729/livereload.js';
      document.body.appendChild(script);
    })();
  </script>\`
]
\`\`\`

This fix:
- Removes document.write() completely
- Uses safe DOM methods (createElement/appendChild)
- Hardcodes 'localhost' to prevent manipulation
- Still provides livereload functionality

## Steps to Apply the Fix:

1. Use Read to see the current state of config/env/development.js
2. Use Edit to replace the environmentalScripts array with the safe version above
3. Use Read again to verify your changes were applied
4. Provide the JSON summary with the complete fixed file content

The test is checking that malicious values in location.host cannot execute arbitrary JavaScript.`;
}