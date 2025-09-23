import { IssueContext, IssueType } from '../types/index.js';

/**
 * Build a prompt for initial issue analysis
 */
export function buildAnalysisPrompt(issue: IssueContext): string {
  const basePrompt = `I need you to analyze the following software issue and provide a technical assessment.

Issue Title: ${issue.title}

Issue Description:
${issue.body}

Repository: ${issue.repository.fullName}
Primary Language: ${issue.repository.language || 'Unknown'}

Please provide:
1. A determination of what type of issue this is (bug, feature request, refactoring, etc.)
2. Which files are likely to need modification
3. An estimate of the complexity (simple, medium, complex)
4. A suggested approach to solve the issue

Focus on technical details and be specific about the implementation approach. If the issue description lacks critical information, note what additional context would be needed.`;

  return basePrompt;
}

/**
 * Build a prompt for generating a solution to the issue
 */
export function buildSolutionPrompt(
  issue: IssueContext,
  analysisData: any,
  fileContents: Record<string, string>
): string {
  // Start with a base prompt
  let prompt = `I need you to generate a solution for the following software issue:

Issue Title: ${issue.title}

Issue Description:
${issue.body}

Repository: ${issue.repository.fullName}
Primary Language: ${issue.repository.language || 'Unknown'}

Based on my analysis, this is a ${analysisData.issueType} issue with ${analysisData.estimatedComplexity} complexity.

The suggested approach is: ${analysisData.suggestedApproach}

I need you to generate specific code changes to resolve this issue. Here are the relevant files with their current content:
`;

  // Add file contents
  for (const [filePath, content] of Object.entries(fileContents)) {
    prompt += `\n--- ${filePath} ---\n\`\`\`\n${content}\n\`\`\`\n`;
  }

  // Add instructions for the response format
  prompt += `\nIMPORTANT: Format your response EXACTLY as shown below for proper parsing:

CRITICAL: You MUST modify EXISTING files only. DO NOT create new files. Make changes in-place to fix the vulnerability.

For each file that needs to be modified, use one of these formats:

Option 1 (preferred):
filename.ext:
\`\`\`language
[complete file content]
\`\`\`

Option 2:
--- filename.ext ---
\`\`\`language
[complete file content]
\`\`\`

Example:
src/auth/login.js:
\`\`\`javascript
function authenticateUser(username, password) {
  // secure implementation here
}
\`\`\`

CRITICAL: The parser requires EXACT formatting. Use one of the above formats or the solution will fail.

After all file changes, add:
1. Brief explanation of changes
2. How this fixes the issue
3. Any assumptions made

Provide complete, working code following existing patterns.`;

  return prompt;
}

/**
 * Build a prompt for PR description generation
 */
export function buildPrDescriptionPrompt(
  issue: IssueContext,
  analysisData: any,
  changes: Record<string, string>
): string {
  const filesChanged = Object.keys(changes).join(', ');
  
  const prompt = `I need you to generate a clear, professional pull request description for the following changes.

Issue: ${issue.title} (#${issue.number})

Issue Type: ${analysisData.issueType}
Complexity: ${analysisData.estimatedComplexity}

Files modified: ${filesChanged}

Approach taken: ${analysisData.suggestedApproach}

Please generate a pull request description with:
1. A clear, concise title that summarizes the change
2. A detailed description explaining what was changed and why
3. Any testing instructions or considerations for reviewers
4. References to the original issue

Keep the tone professional but friendly, and focus on the technical details that would be relevant to code reviewers.`;

  return prompt;
}

/**
 * Get prompt templates specific to the issue type
 */
export function getIssueTypePromptTemplate(issueType: IssueType): string {
  switch (issueType) {
  case 'bug':
    return 'For this bug fix, focus on identifying the root cause first before implementing a solution. Consider edge cases and ensure your fix doesn\'t introduce regressions. Include tests that verify the fix works as expected.';
      
  case 'feature':
    return 'For this feature implementation, ensure the solution is well-integrated with the existing architecture. Consider backward compatibility, error handling, and appropriate documentation. Include tests for the new functionality.';
      
  case 'refactoring':
    return 'For this refactoring task, maintain identical functionality while improving the code structure. Focus on readability, maintainability, and adherence to design principles. Ensure tests pass before and after your changes.';
      
  case 'performance':
    return 'For this performance improvement, focus on identifying bottlenecks and optimizing critical paths. Consider time and space complexity, and measure before/after metrics where possible. Be careful not to sacrifice code readability for marginal gains.';
      
  case 'security':
    return 'For this security issue, approach with extra caution. Ensure the fix addresses the root vulnerability completely without introducing new attack vectors. Consider all possible exploit scenarios and follow security best practices.';
      
  case 'documentation':
    return 'For this documentation task, focus on clarity, completeness, and accuracy. Ensure examples are working and up-to-date. Consider both beginner and advanced users, and follow any documentation style guidelines present in the project.';
      
  case 'dependency':
    return 'For this dependency update, carefully check for breaking changes and necessary adjustments to the codebase. Update any affected tests and documentation. Consider whether the update brings security fixes that should be highlighted.';
      
  case 'test':
    return 'For this testing task, ensure comprehensive coverage of edge cases and typical usage patterns. Follow existing testing patterns and naming conventions. Consider both unit and integration tests as appropriate for the code being tested.';
      
  default:
    return 'For this task, ensure your solution is well-integrated with the existing codebase and follows the project\'s coding conventions. Include appropriate error handling, documentation, and tests.';
  }
}