/**
 * Claude Code SDK adapter for the RSOLV AI integration
 * This class provides a wrapper around the Claude Code TypeScript SDK
 * for enhanced context-gathering in repository analysis and solution generation.
 */
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import { IssueContext } from '../../types/index.js';
import { PullRequestSolution, AIConfig, ClaudeCodeConfig } from '../types.js';
import { IssueAnalysis } from '../types.js';
import { ConversationLogger, ConversationLogEntry } from '../conversation-logger.js';

/**
 * Analytics data for Claude Code usage
 */
interface UsageData {
  startTime: number;
  endTime?: number;
  issueId: string;
  successful: boolean;
  solutionGenerationTime?: number;
  cost?: number;
  errorType?: string;
  retryCount?: number;
}

/**
 * Claude Code SDK adapter class
 */
export class ClaudeCodeAdapter {
  protected repoPath: string;
  protected config: AIConfig;
  protected claudeConfig: ClaudeCodeConfig;
  private tempDir: string;
  private usageData: UsageData[] = [];
  private credentialManager?: any;
  private conversationLogger: ConversationLogger;
  
  /**
   * Create a new Claude Code SDK adapter
   */
  constructor(config: AIConfig, repoPath: string = process.cwd(), credentialManager?: any) {
    this.config = config;
    this.repoPath = repoPath;
    this.credentialManager = credentialManager;
    
    // Initialize Claude Code config with defaults
    this.claudeConfig = config.claudeCodeConfig || {};
    this.tempDir = this.claudeConfig.tempDir || path.join(process.cwd(), 'temp');
    
    // Initialize conversation logger
    this.conversationLogger = ConversationLogger.getInstance();
    this.conversationLogger.initialize().catch(err => {
      logger.warn('Failed to initialize conversation logger:', err);
    });
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
      } catch (error) {
        logger.warn(`Failed to create temp directory: ${error}`);
      }
    }
    
    if (this.claudeConfig.verboseLogging) {
      logger.info('Claude Code SDK adapter initialized with config:', JSON.stringify({
        tempDir: this.tempDir,
        contextOptions: this.claudeConfig.contextOptions,
        retryOptions: this.claudeConfig.retryOptions,
        timeout: this.claudeConfig.timeout
      }, null, 2));
    }
  }

  /**
   * Check if Claude Code SDK is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if the SDK is installed
      const { query } = await import('@anthropic-ai/claude-code');
      
      // If no executable path is configured and we're in a test environment, assume it's available
      if (!this.claudeConfig.executablePath && process.env.NODE_ENV === 'test') {
        return true;
      }
      
      // Check if the executable exists
      // Try multiple locations for the Claude Code executable
      const possiblePaths = [
        this.claudeConfig.executablePath,
        path.join(__dirname, '..', '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
        path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
        '/home/dylan/dev/rsolv/RSOLV-action/node_modules/@anthropic-ai/claude-code/cli.js'
      ].filter(Boolean);
      
      const foundPath = possiblePaths.find(p => p && fs.existsSync(p));
      const executablePath: string = foundPath || (possiblePaths.length > 0 && possiblePaths[0] ? possiblePaths[0] : '/dev/null');
      const execExists = fs.existsSync(executablePath);
      
      if (!execExists) {
        logger.warn(`Claude Code executable not found at: ${executablePath}`);
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Claude Code SDK not available', error as Error);
      return false;
    }
  }

  /**
   * Generate a solution for an issue using Claude Code SDK
   */
  async generateSolution(
    issueContext: IssueContext, 
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): Promise<{ success: boolean; message: string; changes?: Record<string, string>; error?: string; messages?: any[] }> {
    let errorRetryCount = 0;
    const maxRetries = this.claudeConfig.retryOptions?.maxRetries ?? 2;
    const timeout = this.claudeConfig.timeout ?? 1800000; // 30 minutes default for exploration
    
    // Initialize usage tracking
    const usageEntry: UsageData = {
      startTime: Date.now(),
      issueId: issueContext.id,
      successful: false
    };
    
    try {
      logger.info(`Generating solution using Claude Code SDK for issue: ${issueContext.id}`);
      
      // Check if Claude Code SDK is available
      const available = await this.isAvailable();
      if (!available) {
        logger.warn('Claude Code CLI not available');
        usageEntry.errorType = 'cli_not_available';
        this.trackUsage(usageEntry);
        
        return {
          success: false,
          message: 'Claude Code CLI not available',
          error: `Claude Code CLI not available. Please ensure @anthropic-ai/claude-code is installed and the executable path is correct.

Installation instructions:
1. Install Claude Code: npm install -g @anthropic-ai/claude-code
2. Verify installation: claude -v
3. Visit https://claude.ai/console/claude-code for more information`
        };
      }
      
      // Construct the prompt
      const prompt = this.constructPrompt(issueContext, analysis, enhancedPrompt);
      
      // Set up API key
      let apiKey = this.config.apiKey;
      
      if (this.config.useVendedCredentials && this.credentialManager) {
        try {
          apiKey = this.credentialManager.getCredential('anthropic');
          logger.info('Using vended Anthropic credential for Claude Code SDK');
        } catch (error) {
          logger.warn('Failed to get vended credential, falling back to config API key', error);
        }
      }
      
      // Set API key in environment
      process.env.ANTHROPIC_API_KEY = apiKey;
      
      // Execute query with timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeout);
      
      const messages: SDKMessage[] = [];
      let solution: PullRequestSolution | null = null;
      let explorationPhase = true;
      let messageCount = 0;
      const conversationStartTime = Date.now();
      
      try {
        
        if (this.claudeConfig.verboseLogging) {
          logger.info(`Starting Claude Code exploration for issue: ${issueContext.title}`);
        }
        
        // Start conversation logging
        await this.conversationLogger.logSummary(
          issueContext.id,
          `Starting Claude Code conversation for issue: ${issueContext.title}`
        );
        
        // Check for MCP config file
        const mcpConfigPath = path.join(this.repoPath, 'mcp-config.json');
        const mcpConfigExists = fs.existsSync(mcpConfigPath);
        
        const queryOptions: any = {
          abortController,
          cwd: this.repoPath,
          maxTurns: 30, // Allow many turns for exploration and iterative development
          pathToClaudeCodeExecutable: (() => {
            const possiblePaths = [
              this.claudeConfig.executablePath,
              path.join(__dirname, '..', '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
              path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
              '/home/dylan/dev/rsolv/RSOLV-action/node_modules/@anthropic-ai/claude-code/cli.js'
            ].filter(Boolean);
            const found = possiblePaths.find(p => p && fs.existsSync(p));
            return found || (possiblePaths.length > 0 && possiblePaths[0] ? possiblePaths[0] : '/dev/null');
          })(),
        };
        
        // For structured phases, we need core Edit/MultiEdit tools, not MCP tools
        // MCP tools like TodoWrite don't actually edit files and interfere with structured phases
        const useStructuredPhases = this.claudeConfig?.useStructuredPhases;
        
        if (useStructuredPhases) {
          // Explicitly disable MCP for structured phases to ensure core tools are used
          queryOptions.mcpConfig = null;
          logger.info('Disabled MCP for structured phases - using core Edit/MultiEdit tools only');
        } else if (mcpConfigExists) {
          // Add MCP config if available and not using structured phases
          queryOptions.mcpConfig = mcpConfigPath;
          logger.info('Using MCP configuration from mcp-config.json, including sequential thinking');
        }
        
        for await (const message of query({
          prompt,
          options: queryOptions,
        })) {
          messages.push(message);
          messageCount++;
          
          // Log exploration progress
          if (this.claudeConfig.verboseLogging && message.type === 'assistant') {
            const assistantMessage = message as any;
            if (assistantMessage.message?.content) {
              for (const content of assistantMessage.message.content) {
                if (content.type === 'tool_use') {
                  logger.debug(`Claude exploring: ${content.name} tool`);
                  explorationPhase = true;
                } else if (content.type === 'text' && content.text) {
                  // Check if we're transitioning to solution phase
                  if (content.text.includes('```json') || content.text.includes('ultimate solution') || content.text.includes('Final Output')) {
                    explorationPhase = false;
                    logger.info('Claude transitioning to solution generation phase');
                  }
                }
              }
            }
          }
          
          // Try to extract solution from text messages
          if (message.type === 'assistant' && (message as any).text) {
            const potentialSolution = this.extractSolutionFromText((message as any).text);
            if (potentialSolution) {
              solution = potentialSolution;
              if (this.claudeConfig.verboseLogging) {
                logger.info('Found solution in text message');
              }
            }
          }
          
          // Also check assistant messages for embedded solutions
          if (message.type === 'assistant') {
            const assistantMessage = message as any;
            if (assistantMessage.message?.content) {
              for (const content of assistantMessage.message.content) {
                if (content.type === 'text' && content.text) {
                  const potentialSolution = this.extractSolutionFromText(content.text);
                  if (potentialSolution) {
                    solution = potentialSolution;
                    if (this.claudeConfig.verboseLogging) {
                      logger.info('Found solution in assistant message');
                    }
                  }
                }
              }
            }
          }
          
          // Check for final result message (SDK v1.0.18+ sends this as the final message)
          if ((message as any).type === 'result' || (message as any).type === 'final_result') {
            const resultMessage = message as any;
            if (this.claudeConfig.verboseLogging) {
              logger.info(`Received ${message.type} message from Claude Code SDK`);
            }
            
            // Try to extract solution from result message
            if (resultMessage.text) {
              const potentialSolution = this.extractSolutionFromText(resultMessage.text);
              if (potentialSolution) {
                solution = potentialSolution;
                logger.info('Found solution in result message');
              }
            } else if (resultMessage.content) {
              // Sometimes the content is in a different structure
              const potentialSolution = this.extractSolutionFromText(
                typeof resultMessage.content === 'string' 
                  ? resultMessage.content 
                  : JSON.stringify(resultMessage.content)
              );
              if (potentialSolution) {
                solution = potentialSolution;
                logger.info('Found solution in result message content');
              }
            }
          }
        }
        
        clearTimeout(timeoutId);
        
        // Track usage
        usageEntry.endTime = Date.now();
        usageEntry.solutionGenerationTime = usageEntry.endTime - usageEntry.startTime;
        
        // Log full conversation if enabled
        const conversationLogEntry: ConversationLogEntry = {
          issueId: issueContext.id,
          timestamp: new Date().toISOString(),
          provider: 'anthropic',
          model: 'claude-code',
          messages: messages.map(msg => ({
            type: msg.type,
            content: msg,
            timestamp: new Date().toISOString()
          })),
          metadata: {
            workflowRun: process.env.GITHUB_RUN_ID,
            workflowJob: process.env.GITHUB_JOB,
            repository: process.env.GITHUB_REPOSITORY,
            issueNumber: parseInt(issueContext.id.split('#')[1] || '0'),
            duration: Date.now() - conversationStartTime,
            tokenUsage: {
              prompt: 0, // Claude Code SDK doesn't expose token usage
              completion: 0,
              total: 0
            }
          },
          result: {
            success: !!solution,
            solutionGenerated: !!solution
          }
        };
        
        await this.conversationLogger.logConversation(conversationLogEntry);
        
        if (solution) {
          usageEntry.successful = true;
          this.trackUsage(usageEntry);
          
          if (this.claudeConfig.verboseLogging) {
            logger.info(`Claude Code completed exploration with ${messageCount} messages`);
            logger.info(`Solution found with ${solution.files.length} file(s) to change`);
          }
          
          await this.conversationLogger.logSummary(
            issueContext.id,
            `Claude Code conversation completed successfully with ${messageCount} messages and ${solution.files.length} files changed`
          );
          
          // Convert to expected format
          const changes: Record<string, string> = {};
          solution.files.forEach(file => {
            changes[file.path] = file.changes;
          });
          
          return {
            success: true,
            message: `Solution generated with Claude Code SDK after ${messageCount} exploration steps`,
            changes,
            messages
          };
        } else {
          logger.warn(`No solution found in Claude Code SDK response after ${messageCount} messages`);
          usageEntry.errorType = 'no_solution_found';
          this.trackUsage(usageEntry);
          
          await this.conversationLogger.logSummary(
            issueContext.id,
            `Claude Code conversation completed without solution after ${messageCount} messages`
          );
          
          // Enhanced debugging: Log the last few messages to understand what Claude output
          if (messages.length > 0) {
            const lastMessages = messages.slice(-5); // Get last 5 messages for better context
            logger.warn('Last 5 messages from Claude Code SDK:');
            
            lastMessages.forEach((m, index) => {
              const msgInfo: any = {
                index: messages.length - 5 + index,
                type: m.type,
                hasText: !!(m as any).text,
                hasContent: !!(m as any).content,
                hasMessage: !!(m as any).message
              };
              
              // Try to extract actual content
              if ((m as any).text) {
                msgInfo.textPreview = (m as any).text.slice(0, 200);
              }
              if ((m as any).content) {
                msgInfo.contentType = typeof (m as any).content;
                if (typeof (m as any).content === 'string') {
                  msgInfo.contentPreview = (m as any).content.slice(0, 200);
                }
              }
              if ((m as any).message?.content) {
                msgInfo.messageContent = Array.isArray((m as any).message.content) 
                  ? (m as any).message.content.map((c: any) => ({ type: c.type, hasText: !!c.text }))
                  : 'not an array';
              }
              
              logger.warn(`Message ${msgInfo.index}:`, msgInfo);
            });
            
            // Specifically check if there was a result message
            const resultMessage = messages.find(m => (m as any).type === 'result' || (m as any).type === 'final_result');
            if (resultMessage) {
              logger.warn('Found result message but could not extract solution:', {
                type: resultMessage.type,
                hasText: !!(resultMessage as any).text,
                hasContent: !!(resultMessage as any).content,
                keys: Object.keys(resultMessage)
              });
            } else {
              logger.warn('No result/final_result message found in conversation');
            }
          }
          
          return {
            success: false,
            message: 'No solution found in response',
            error: `Claude Code explored the repository (${messageCount} steps) but did not generate a valid JSON solution. This might indicate the issue requires more context or manual intervention.`,
            messages
          };
        }
      } catch (queryError) {
        const errorMessage = (queryError as Error).message || String(queryError);
        const errorType = (queryError as Error).name === 'AbortError' || errorMessage.includes('AbortError') 
          ? 'timeout' 
          : 'query_error';
        
        // Log error to conversation logger
        const errorLogEntry: ConversationLogEntry = {
          issueId: issueContext.id,
          timestamp: new Date().toISOString(),
          provider: 'anthropic',
          model: 'claude-code',
          messages: messages.map((msg: any) => ({
            type: msg.type,
            content: msg,
            timestamp: new Date().toISOString()
          })),
          metadata: {
            workflowRun: process.env.GITHUB_RUN_ID,
            workflowJob: process.env.GITHUB_JOB,
            repository: process.env.GITHUB_REPOSITORY,
            issueNumber: parseInt(issueContext.id.split('#')[1] || '0'),
            duration: Date.now() - conversationStartTime
          },
          result: {
            success: false,
            error: errorMessage
          }
        };
        
        await this.conversationLogger.logConversation(errorLogEntry);
        await this.conversationLogger.logSummary(
          issueContext.id,
          `Claude Code conversation failed: ${errorType} - ${errorMessage}`
        );
        
        if (errorType === 'timeout') {
          logger.error(`Claude Code SDK execution timed out after ${timeout/1000} seconds`);
          usageEntry.errorType = 'timeout';
          
          usageEntry.endTime = Date.now();
          this.trackUsage(usageEntry);
          
          return {
            success: false,
            message: 'Claude Code SDK execution failed',
            error: `Claude Code SDK execution timed out after ${timeout/1000} seconds`
          };
        } else {
          logger.error('Claude Code SDK query failed', queryError as Error);
          usageEntry.errorType = 'query_error';
          
          usageEntry.endTime = Date.now();
          this.trackUsage(usageEntry);
          
          return {
            success: false,
            message: 'Claude Code SDK execution failed',
            error: `Claude Code SDK execution failed: ${errorMessage}`
          };
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error('Unexpected error generating solution with Claude Code SDK', error as Error);
      usageEntry.errorType = 'unexpected_error';
      usageEntry.endTime = Date.now();
      this.trackUsage(usageEntry);
      
      return {
        success: false,
        message: 'Unexpected error using Claude Code SDK',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Track usage data for analytics
   */
  private trackUsage(data: UsageData): void {
    if (this.claudeConfig.trackUsage !== false) {
      this.usageData.push(data);
      
      // Save analytics locally
      const analyticsPath = path.join(this.tempDir, 'claude-code-analytics.json');
      try {
        if (this.claudeConfig.verboseLogging) {
          logger.debug(`Saving analytics to: ${analyticsPath}`);
        }
        let existingData: UsageData[] = [];
        if (fs.existsSync(analyticsPath)) {
          existingData = JSON.parse(fs.readFileSync(analyticsPath, 'utf-8'));
        }
        
        existingData.push(data);
        
        // Keep only last 100 entries
        if (existingData.length > 100) {
          existingData = existingData.slice(-100);
        }
        
        fs.writeFileSync(analyticsPath, JSON.stringify(existingData, null, 2));
        
        if (this.claudeConfig.verboseLogging) {
          logger.debug(`Analytics saved successfully with ${existingData.length} entries`);
        }
      } catch (error) {
        logger.warn('Error saving analytics data', error as Error);
      }
      
      if (this.claudeConfig.verboseLogging) {
        const durationSeconds = data.endTime ? (data.endTime - data.startTime) / 1000 : 0;
        logger.info(`Usage stats for issue ${data.issueId}: ` +
          `${data.successful ? 'Success' : 'Failed'} in ${durationSeconds.toFixed(1)}s`);
      }
    }
  }
  
  /**
   * Construct the prompt for Claude Code SDK
   */
  protected constructPrompt(
    issueContext: IssueContext, 
    analysis: IssueAnalysis,
    enhancedPrompt?: string
  ): string {
    if (enhancedPrompt) {
      return enhancedPrompt;
    }
    
    return `You are an expert developer tasked with fixing an issue in a codebase. I need you to explore the repository, understand the problem deeply, and create a comprehensive solution.

## Issue Details:
- **Title**: ${issueContext.title}
- **Description**: ${issueContext.body}
- **Complexity**: ${analysis.complexity}
- **Estimated Time**: ${analysis.estimatedTime} minutes
- **Initial Related Files**: ${analysis.relatedFiles?.join(', ') || 'To be discovered through exploration'}

## Your Task:

### Phase 1: Repository Exploration
First, explore the repository structure to understand:
- The overall architecture and file organization
- Where the vulnerability or issue might be located
- Related components that might be affected
- Existing patterns and coding standards

Use tools like Grep, Glob, and Read to explore the codebase thoroughly.

### Phase 2: Deep Analysis
Once you understand the codebase:
- Locate the exact source of the issue
- Understand how the vulnerable code works
- Identify all files that need changes
- Consider security implications and edge cases

### Phase 3: Solution Development
Develop your solution iteratively:
- Start with the core fix
- Add necessary validation and error handling
- Ensure the fix follows existing code patterns
- Consider adding tests if appropriate

### Phase 4: Final Output
After you've completed your exploration and solution development, provide your ultimate solution as a JSON object with this EXACT structure:

\`\`\`json
{
  "title": "Brief title for the PR (e.g., 'Fix XSS vulnerability in login form')",
  "description": "Detailed description explaining what was vulnerable, why it was dangerous, and how your fix addresses it",
  "files": [
    {
      "path": "exact/path/to/file.js",
      "changes": "The COMPLETE new content for the file (not a diff, but the full file content after changes)"
    }
  ],
  "tests": [
    "Description of test case 1 to verify the fix",
    "Description of test case 2 for edge cases"
  ]
}
\`\`\`

Remember: Take your time to explore and understand the codebase thoroughly before implementing the solution. The final JSON must be properly formatted and include the complete file contents after your changes.`;
  }
  
  /**
   * Extract solution from text response
   */
  protected extractSolutionFromText(text: string): PullRequestSolution | null {
    try {
      // Try to find JSON in code blocks
      const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        const solution = JSON.parse(jsonBlockMatch[1]);
        
        if (solution.title && solution.description && Array.isArray(solution.files)) {
          logger.debug('Successfully extracted solution from JSON code block');
          return {
            title: solution.title,
            description: solution.description,
            files: solution.files,
            tests: solution.tests || []
          };
        }
      }
      
      // Try to parse the entire text as JSON
      const solution = JSON.parse(text);
      if (solution.title && solution.description && Array.isArray(solution.files)) {
        logger.debug('Successfully parsed solution directly from text');
        return {
          title: solution.title,
          description: solution.description,
          files: solution.files,
          tests: solution.tests || []
        };
      }
    } catch (error) {
      // Not JSON or invalid format
      logger.debug('Could not extract JSON solution from text');
    }
    
    return null;
  }
  
  /**
   * Get usage analytics data
   */
  getUsageData(): UsageData[] {
    return this.usageData;
  }
  
  /**
   * Get analytics summary
   */
  getAnalyticsSummary(): object {
    const total = this.usageData.length;
    if (total === 0) {
      return { total: 0 };
    }
    
    const successful = this.usageData.filter(d => d.successful).length;
    const successRate = (successful / total) * 100;
    
    const avgDuration = this.usageData
      .filter(d => d.endTime !== undefined)
      .map(d => (d.endTime! - d.startTime) / 1000)
      .reduce((a, b) => a + b, 0) / total;
    
    const totalCost = this.usageData
      .filter(d => d.cost !== undefined)
      .map(d => d.cost!)
      .reduce((a, b) => a + b, 0);
    
    const errorTypes = this.usageData
      .filter(d => d.errorType)
      .reduce((acc, d) => {
        const type = d.errorType!;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    return {
      total,
      successful,
      successRate: successRate.toFixed(1) + '%',
      avgDuration: avgDuration.toFixed(1) + 's',
      totalCost: '$' + totalCost.toFixed(4),
      errorTypes
    };
  }
}