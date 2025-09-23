import { IssueContext, ActionConfig, AnalysisData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getAiClient } from './client.js';
import { buildSolutionPrompt, getIssueTypePromptTemplate } from './prompts.js';
import { ThreeTierExplanationFramework, CompleteExplanation } from '../security/explanation-framework.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { AIConfig, AIProvider, IssueAnalysis } from './types.js';

/**
 * Result of solution generation
 */
export interface SolutionResult {
  success: boolean;
  message: string;
  changes?: Record<string, string>;
  error?: string;
  explanations?: CompleteExplanation;
}

/**
 * Generate a solution for the issue based on AI analysis
 */
export async function generateSolution(
  issue: IssueContext,
  analysisData: AnalysisData,
  config: ActionConfig,
  injectedClient?: any,
  injectedFileGetter?: any,
  securityAnalysis?: any
): Promise<SolutionResult> {
  try {
    logger.info(`Generating solution for issue #${issue.number}`);
    
    // Handle Claude Code provider specially
    if (config.aiProvider.provider === 'claude-code' && !injectedClient) {
      logger.info('Using Claude Code for solution generation');
      
      // Get credential manager if using vended credentials
      let credentialManager;
      if (config.aiProvider.useVendedCredentials && config.rsolvApiKey) {
        // Set RSOLV_API_KEY environment variable for AI client
        process.env.RSOLV_API_KEY = config.rsolvApiKey;
        logger.info('Set RSOLV_API_KEY environment variable for vended credentials');
        
        const { CredentialManagerSingleton } = await import('../credentials/singleton.js');
        credentialManager = await CredentialManagerSingleton.getInstance(config.rsolvApiKey);
      }
      
      // Convert AiProviderConfig to AIConfig
      const aiConfig: AIConfig = {
        provider: config.aiProvider.provider as AIProvider,
        apiKey: config.aiProvider.apiKey,
        model: config.aiProvider.model,
        temperature: config.aiProvider.temperature,
        maxTokens: config.aiProvider.maxTokens,
        useVendedCredentials: config.aiProvider.useVendedCredentials,
        claudeCodeConfig: {}
      };
      
      // Use Claude Code adapter
      const claudeCodeAdapter = new ClaudeCodeAdapter(aiConfig, process.cwd(), credentialManager);
      
      // Convert AnalysisData to IssueAnalysis
      const issueAnalysis: IssueAnalysis = {
        summary: `${analysisData.issueType} issue requiring fixes`,
        complexity: analysisData.estimatedComplexity === 'simple' ? 'low' : 
                   analysisData.estimatedComplexity === 'complex' ? 'high' : 'medium',
        estimatedTime: 60, // Default estimate
        potentialFixes: [analysisData.suggestedApproach],
        recommendedApproach: analysisData.suggestedApproach,
        relatedFiles: analysisData.filesToModify
      };
      
      // Use Claude Code for solution generation
      const claudeResult = await claudeCodeAdapter.generateSolution(issue, issueAnalysis);
      
      // If Claude Code succeeded, return the result
      if (claudeResult.success) {
        return {
          success: true,
          message: 'Solution generated with Claude Code',
          changes: claudeResult.changes
        };
      }
      
      // If Claude Code failed, fall back to standard method
      if (claudeResult.error && claudeResult.error.includes('Claude Code CLI not available')) {
        logger.info('Claude Code not available, falling back to standard AI provider API');
        // Continue to standard flow below
      } else {
        // For other errors, return the error
        return {
          success: false,
          message: claudeResult.message,
          error: claudeResult.error
        };
      }
    }
    
    // Use injected client for testing or get standard AI client
    // If we're falling back from claude-code, use anthropic provider with latest Sonnet model
    const providerConfig = config.aiProvider.provider === 'claude-code' ? 
      { ...config.aiProvider, provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' } : 
      config.aiProvider;
    const aiClient = injectedClient || await getAiClient(providerConfig);
    
    // Get file contents from repository
    const fileContents = await getFilesForAnalysis(issue, analysisData, injectedFileGetter);
    
    if (Object.keys(fileContents).length === 0) {
      logger.warn(`No files found for analysis in issue #${issue.number}`);
      return {
        success: false,
        message: 'No relevant files found for analysis',
      };
    }
    
    // Get issue-type specific prompt template
    const typeSpecificGuidance = getIssueTypePromptTemplate(analysisData.issueType);
    
    // Build the solution prompt
    let prompt = `${buildSolutionPrompt(issue, analysisData, fileContents)}\n\n${typeSpecificGuidance}`;
    
    // Add security context and generate explanations if available
    let explanations: CompleteExplanation | undefined;
    if (securityAnalysis && securityAnalysis.vulnerabilities && securityAnalysis.vulnerabilities.length > 0) {
      logger.info(`Including ${securityAnalysis.vulnerabilities.length} security vulnerabilities in solution prompt`);
      
      // Generate three-tier explanations
      const explanationFramework = new ThreeTierExplanationFramework();
      explanations = explanationFramework.generateCompleteExplanation(
        securityAnalysis.vulnerabilities,
        fileContents
      );
      logger.info(`Generated three-tier explanations for ${explanations.lineLevelExplanations.length} vulnerabilities`);
      
      prompt += `\n\n## Security Analysis Results

The following security vulnerabilities were detected and MUST be addressed in your solution:

${securityAnalysis.vulnerabilities.map((vuln: any) => 
    `- **${vuln.severity} Severity**: ${vuln.type} in ${vuln.file}:${vuln.line}
   Pattern: ${vuln.pattern}
   Risk: ${vuln.risk}
   Recommendation: ${vuln.recommendation}`
  ).join('\n\n')}

Please ensure your solution addresses these security issues as a priority.`;
    }
    
    // Generate solution using AI
    logger.info(`Calling AI with prompt length: ${prompt.length} chars`);
    logger.info('Prompt preview (first 500 chars):', prompt.substring(0, 500));
    logger.info('Prompt preview (last 500 chars):', prompt.substring(prompt.length - 500));
    const response = await aiClient.complete(prompt, {
      temperature: 0.2,
      // maxTokens omitted - let client use resolveMaxTokens with FIX_GENERATION use case
      model: config.aiProvider.model || 'claude-3-sonnet-20240229'
    });
    
    // Debug: Log the raw response to see what we're getting
    logger.info(`AI response length: ${response.length} chars`);
    logger.info('Raw AI solution response (first 1000 chars):', response.substring(0, 1000));
    
    // Parse the solution response to extract file changes
    const changes = parseSolutionResponse(response);
    
    logger.debug(`Parsed ${Object.keys(changes).length} file changes from response`);
    
    if (Object.keys(changes).length === 0) {
      logger.warn(`No changes extracted from solution for issue #${issue.number}`);
      return {
        success: false,
        message: 'Failed to extract file changes from AI solution',
      };
    }
    
    return {
      success: true,
      message: 'Solution generated successfully',
      changes,
      explanations
    };
  } catch (error) {
    logger.error(`Error generating solution for issue #${issue.number}`, error);
    return {
      success: false,
      message: `Error generating solution: ${error instanceof Error ? error.message : String(error)}`,
      error: String(error)
    };
  }
}

/**
 * Get necessary file contents from the repository
 */
async function getFilesForAnalysis(
  issue: IssueContext,
  analysisData: AnalysisData,
  fileGetter?: (path: string) => Promise<string>
): Promise<Record<string, string>> {
  try {
    // Start with files identified by AI analysis
    const filesToFetch = [...(analysisData.filesToModify || [])];
    
    // If no files are explicitly identified, try to infer from issue title/description
    if (filesToFetch.length === 0) {
      logger.info('No files explicitly identified, inferring from issue content');
      
      // Example logic to infer files - in a real implementation, this would be more sophisticated
      const combinedText = `${issue.title} ${issue.body}`;
      const fileExtRegex = /\.([a-zA-Z0-9]+)\b/g;
      const fileExts: string[] = [];
      let match;
      
      while ((match = fileExtRegex.exec(combinedText)) !== null) {
        if (!fileExts.includes(match[1])) {
          fileExts.push(match[1]);
        }
      }
      
      logger.debug(`Inferred file extensions: ${fileExts.join(', ')}`);
    }
    
    // Fetch content of identified files
    logger.info(`Fetching content for ${filesToFetch.length} files`);
    const fileContents: Record<string, string> = {};
    
    for (const filePath of filesToFetch) {
      try {
        // Use injected file getter if provided, otherwise simulate
        if (fileGetter) {
          fileContents[filePath] = await fileGetter(filePath);
        } else {
          // In a real implementation, this would fetch files from the GitHub repository
          // Here we just simulate the file content for demonstration purposes
          fileContents[filePath] = await simulateFileContent(filePath);
        }
        logger.debug(`Fetched content for ${filePath}`);
      } catch (error) {
        logger.warn(`Failed to fetch content for ${filePath}`, error);
      }
    }
    
    return fileContents;
  } catch (error) {
    logger.error('Error getting files for analysis', error);
    return {};
  }
}

/**
 * Parse the AI solution response to extract file changes
 */
function parseSolutionResponse(response: string): Record<string, string> {
  const changes: Record<string, string> = {};
  
  try {
    // Look for file blocks in the response - be more flexible with the format
    // Format expected: --- filepath --- followed by ``` code ```
    const fileBlockRegex = /---\s*([\w./-]+)\s*---\s*```[\w]*\n?([\s\S]*?)```/gm;
    let match;
    
    while ((match = fileBlockRegex.exec(response)) !== null) {
      const [, filePath, content] = match;
      if (filePath && content) {
        changes[filePath] = content.trim();
      }
    }
    
    // If the above pattern doesn't match, try alternative formats
    if (Object.keys(changes).length === 0) {
      // Alternative format: ```language filename content ```
      const altFileBlockRegex = /```(\w+)\s+([\w./-]+)\n([\s\S]*?)```/gm;
      while ((match = altFileBlockRegex.exec(response)) !== null) {
        const [, , filePath, content] = match;
        if (filePath && content) {
          changes[filePath] = content.trim();
        }
      }
    }
    
    // Try another format: "filename:" followed by code block
    if (Object.keys(changes).length === 0) {
      const fileHeaderRegex = /([\w./-]+):\s*```[\w]*\n?([\s\S]*?)```/gm;
      while ((match = fileHeaderRegex.exec(response)) !== null) {
        const [, filePath, content] = match;
        if (filePath && content) {
          changes[filePath] = content.trim();
        }
      }
    }
    
    // Last resort: look for any code blocks with file extensions mentioned nearby
    if (Object.keys(changes).length === 0) {
      // Find all code blocks
      const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/gm;
      const fileNameRegex = /([\w./-]+\.\w+)/;
      
      while ((match = codeBlockRegex.exec(response)) !== null) {
        const codeContent = match[1];
        // Look for a filename in the 100 characters before this code block
        const startPos = Math.max(0, match.index - 100);
        const contextBefore = response.substring(startPos, match.index);
        const fileMatch = contextBefore.match(fileNameRegex);
        
        if (fileMatch && codeContent) {
          changes[fileMatch[1]] = codeContent.trim();
        }
      }
    }
    
    return changes;
  } catch (error) {
    logger.error('Error parsing solution response', error);
    return {};
  }
}

/**
 * Simulate fetching file content for development
 */
async function simulateFileContent(filePath: string): Promise<string> {
  // Add a small delay to simulate network latency
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Mock content based on file extension
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  switch (ext) {
  case 'js':
    return `// Example JavaScript file content for ${filePath}\nfunction processData(input) {\n  // TODO: Implement proper validation\n  return input.map(item => item.value);\n}\n\nmodule.exports = { processData };\n`;
      
  case 'ts':
    return `// Example TypeScript file content for ${filePath}\ninterface DataItem {\n  id: string;\n  value: number;\n}\n\nfunction processData(input: DataItem[]): number[] {\n  // TODO: Implement proper validation\n  return input.map(item => item.value);\n}\n\nexport { DataItem, processData };\n`;
      
  case 'py':
    return `# Example Python file content for ${filePath}\ndef process_data(input_data):\n    # TODO: Implement proper validation\n    return [item['value'] for item in input_data]\n\nif __name__ == "__main__":\n    print(process_data([{'value': 1}, {'value': 2}]))\n`;
      
  case 'md':
    return `# Documentation for ${filePath.split('/').pop()?.replace('.md', '')}\n\n## Overview\n\nThis documentation describes the usage and implementation details.\n\n## Installation\n\n\`\`\`bash\nnpm install example-package\n\`\`\`\n\n## Usage\n\n\`\`\`javascript\nconst { processData } = require('example-package');\nconst result = processData([{ id: '1', value: 42 }]);\n\`\`\`\n`;
      
  default:
    return `// Example file content for ${filePath}\n// This is a placeholder for demonstration purposes\n`;
  }
}