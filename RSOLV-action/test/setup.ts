import { beforeEach, vi } from 'vitest';

console.log('[Vitest Setup] Test environment configured');

// Set up environment variables for tests
process.env.GITHUB_TOKEN = 'test-github-token';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Mock external dependencies globally
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

// Mock the AI client responses
export const mockAIResponses = {
  analysis: `This appears to be a bug in the authentication system where token validation is failing for valid tokens that contain special characters.

Files to modify:
- \`src/auth/tokenValidator.js\`
- \`src/utils/stringEscaping.js\`

This is a simple fix that requires updating the token validation function to handle special characters properly.

Suggested Approach:
Update the token validator to properly decode tokens before validation, and ensure that special characters are correctly handled throughout the authentication flow.`,

  solution: `Here's my solution:

--- src/auth/tokenValidator.js ---
\`\`\`javascript
// Example token validator fix
function validateToken(token) {
  // Decode token before validation
  const decodedToken = decodeURIComponent(token);
  
  // Validate the decoded token
  return isValidToken(decodedToken);
}

function isValidToken(token) {
  // Existing validation logic
  return token && token.length > 10;
}

module.exports = { validateToken, isValidToken };
\`\`\`

--- src/utils/stringEscaping.js ---
\`\`\`javascript
// String escaping utilities
function escapeSpecialChars(str) {
  return str.replace(/[&<>"']/g, (match) => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return escapeMap[match];
  });
}

module.exports = { escapeSpecialChars };
\`\`\``,

  prDescription: `## Summary
This PR fixes the token validation issue where special characters in tokens were causing authentication failures.

## Changes
- Updated token validator to decode tokens before validation
- Added proper string escaping utilities
- Fixed authentication flow to handle special characters

## Testing
- Added unit tests for token validation with special characters
- Tested with various token formats
- All existing tests pass

Fixes #123`
};

// Export test configuration
export const testConfig = {
  githubToken: 'test-github-token',
  aiProvider: 'anthropic' as const,
  aiApiKey: 'test-anthropic-key',
  aiModel: 'claude-3-opus-20240229',
  aiTemperature: 0.3,
  aiMaxTokens: 4000,
  dryRun: true,
  enableFeedback: false,
  enableSecurityAnalysis: false,
  containerEnabled: false,
  expertEmail: 'test@example.com'
};