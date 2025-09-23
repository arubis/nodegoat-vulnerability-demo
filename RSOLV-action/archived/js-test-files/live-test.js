// Live test of RSOLV integration with Anthropic API
import fetch from 'node-fetch';

// Define a minimal AI client that uses Anthropic API directly
class AnthropicClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'claude-3-sonnet-20240229';
    console.log(`Initialized Anthropic client with model: ${this.model}`);
  }
  
  async callAPI(prompt) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4000,
          temperature: 0.2,
          system: "You are RSOLV, an AI-powered system for automatically fixing software issues.",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }
  
  async analyzeIssue(title, body, repoContext = {}) {
    console.log(`Analyzing issue: ${title}`);
    
    const prompt = `
Please analyze the following software issue:

Title: ${title}

Description:
${body}

${Object.keys(repoContext).length > 0 ? `Repository context:\n${JSON.stringify(repoContext, null, 2)}\n` : ''}

Please analyze this issue and provide the following information in a structured format:
1. A brief summary of the issue
2. The estimated complexity (low, medium, high)
3. Estimated time to fix (in minutes)
4. Potential approaches to fixing the issue
5. The recommended approach
6. Any related files that might need to be modified
7. Specific changes required

Format your response as valid JSON with the following structure:
{
  "summary": "Brief summary of the issue",
  "complexity": "low|medium|high",
  "estimatedTime": number,
  "potentialFixes": ["approach 1", "approach 2", ...],
  "recommendedApproach": "The best approach to take",
  "relatedFiles": ["file1.js", "file2.js", ...],
  "requiredChanges": ["Change X to Y", "Add function Z", ...]
}

Your response must be valid JSON only, with no other text.
`;
    
    const response = await this.callAPI(prompt);
    
    try {
      // Try parsing the response directly
      return JSON.parse(response);
    } catch (error) {
      // Extract JSON from code blocks if needed
      const match = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.match(/{[\s\S]*}/);
      if (!match) {
        throw new Error('Failed to extract JSON from response');
      }
      return JSON.parse(match[1] || match[0]);
    }
  }
  
  async generateSolution(title, body, analysis, repoContext = {}) {
    console.log(`Generating solution for: ${title}`);
    
    const prompt = `
Please generate a solution for the following software issue:

Title: ${title}

Description:
${body}

Analysis:
${JSON.stringify(analysis, null, 2)}

${Object.keys(repoContext).length > 0 ? `Repository context:\n${JSON.stringify(repoContext, null, 2)}\n` : ''}

Based on the issue and analysis, please generate a solution with the following:
1. A descriptive PR title
2. A detailed PR description explaining the changes
3. The code changes required for each file
4. Any tests that should be added or modified

Format your response as valid JSON with the following structure:
{
  "title": "Fix: descriptive PR title",
  "description": "Detailed explanation of the changes",
  "files": [
    {
      "path": "path/to/file.js",
      "changes": "Complete code for the file or a clear description of changes"
    }
  ],
  "tests": [
    "Description of test 1",
    "Description of test 2"
  ]
}

Your response must be valid JSON only, with no other text.
`;
    
    const response = await this.callAPI(prompt);
    
    try {
      // Try parsing the response directly
      return JSON.parse(response);
    } catch (error) {
      // Extract JSON from code blocks if needed
      const match = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || response.match(/{[\s\S]*}/);
      if (!match) {
        throw new Error('Failed to extract JSON from response');
      }
      return JSON.parse(match[1] || match[0]);
    }
  }
}

// The main test flow
async function main() {
  try {
    console.log('Starting live test of RSOLV AI integration with Anthropic API');
    
    // Sample issue - Change this to test different scenarios
    const issueTitle = 'Fix race condition in concurrent user profile updates';
    const issueBody = `
We've identified a race condition in our application when multiple requests try to update the same user profile simultaneously.

Steps to reproduce:
1. Create a test script that sends multiple update requests to the same user profile endpoint at the same time
2. Observe that some updates are lost or overwritten
3. Check the database and notice that only the last update is saved

Expected behavior: All update requests should be handled correctly, with proper locking or transaction mechanisms to prevent data loss.

Technical details:
- The issue occurs in the user profile update service
- We're using a Node.js backend with Express and MongoDB
- Current implementation fetches the user record, updates it in memory, then saves it back without any concurrency control
- We need a solution that works with our existing MongoDB setup
`;
    
    // Using the API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    // Create AI client
    const client = new AnthropicClient(apiKey);
    
    // Run the issue analysis
    console.log('\nRunning analysis...');
    const analysis = await client.analyzeIssue(issueTitle, issueBody);
    console.log('\n=== Analysis Result ===');
    console.log(JSON.stringify(analysis, null, 2));
    
    // Generate a solution
    console.log('\nGenerating solution...');
    const solution = await client.generateSolution(issueTitle, issueBody, analysis);
    console.log('\n=== Solution Result ===');
    console.log(JSON.stringify(solution, null, 2));
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
main();