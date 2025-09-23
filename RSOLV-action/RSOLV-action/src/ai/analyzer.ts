import { IssueContext, ActionConfig, AnalysisData, IssueType } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getAiClient } from './client.js';
import { buildAnalysisPrompt } from './prompts.js';
// import { SecurityDetector, Vulnerability } from '../security/index.js';

/**
 * Analyze an issue with AI to determine the best approach for fixing it
 */
export async function analyzeIssue(
  issue: IssueContext,
  config: ActionConfig,
  injectedClient?: any
): Promise<AnalysisData> {
  logger.info(`Analyzing issue #${issue.number} with AI`);
  
  // Check if we're in dev mode with Claude Max
  const isDevMode = process.env.RSOLV_DEV_MODE === 'true' && 
                    process.env.RSOLV_USE_CLAUDE_MAX === 'true';
  
  // In dev mode with Claude Max, skip the AI client (we'll use Claude Max directly later)
  // For now, return a basic analysis
  if (isDevMode && !injectedClient) {
    logger.info('Development mode with Claude Max - using simplified analysis');
    return {
      issueType: determineIssueType(issue),
      filesToModify: extractFilesFromIssue(issue),
      estimatedComplexity: 'medium',
      requiredContext: [],
      suggestedApproach: 'Fix security vulnerability using Claude Code Max',
      confidenceScore: 0.8,
      canBeFixed: true
    };
  }
  
  // Use injected client for testing or create AI client based on configuration
  const aiClient = injectedClient || await getAiClient(config.aiProvider);
  
  // Build analysis prompt based on issue context
  const prompt = buildAnalysisPrompt(issue);
  
  try {
    // Send request to AI provider
    const response = await aiClient.complete(prompt, {
      temperature: config.aiProvider.temperature || 0.2,
      maxTokens: config.aiProvider.maxTokens, // Let client use resolveMaxTokens internally
      model: config.aiProvider.model
    });
    
    logger.debug('AI analysis response received', { response });
    
    // Parse response to extract structured data
    const analysisData = parseAnalysisResponse(response, issue);
    
    return analysisData;
  } catch (error) {
    logger.error('Error analyzing issue with AI', error);
    throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse the AI response to extract structured analysis data
 */
function parseAnalysisResponse(response: string, issue: IssueContext): AnalysisData {
  try {
    // Debug: Log the actual AI response
    logger.info(`AI analysis response for issue #${issue.number}:`, response.substring(0, 500));
    
    // Simple heuristic for determining issue type from title/body
    const issueType = determineIssueType(issue);
    
    // For the MVP, we'll use a simplified analysis extraction
    // In production, we would use more sophisticated extraction techniques
    const filesToModify: string[] = [];
    let estimatedComplexity: 'simple' | 'medium' | 'complex' = 'medium';
    
    // Look for file paths in the AI response (more flexible)
    const filePathRegex = /`([\w\-./]+\.[\w]+)`|"([\w\-./]+\.[\w]+)"|'([\w\-./]+\.[\w]+)'|([\w\-./]*\/[\w\-./]*\.(?:js|ts|py|java|rb|php|go|rs|cpp|c|h))/g;
    let match;
    while ((match = filePathRegex.exec(response)) !== null) {
      const filePath = match[1] || match[2] || match[3] || match[4];
      if (filePath && !filesToModify.includes(filePath)) {
        filesToModify.push(filePath);
      }
    }
    
    // Also look for common file extensions mentioned without quotes  
    const commonFiles = ['login.js', 'auth.js', 'login.ts', 'auth.ts', 'authentication.js', 'authentication.ts', 'security.js', 'security.ts'];
    for (const file of commonFiles) {
      if (response.toLowerCase().includes(file.toLowerCase()) && !filesToModify.includes(file)) {
        filesToModify.push(file);
      }
    }
    
    // Determine complexity based on AI response
    if (response.toLowerCase().includes('simple') || response.toLowerCase().includes('straightforward')) {
      estimatedComplexity = 'simple';
    } else if (response.toLowerCase().includes('complex') || response.toLowerCase().includes('challenging')) {
      estimatedComplexity = 'complex';
    }
    
    // Extract suggested approach (more flexible)
    let suggestedApproach = '';
    const approachKeywords = ['Suggested Approach:', 'Approach:', 'Solution:', 'Fix:', 'Recommendation:', 'To fix this'];
    
    for (const keyword of approachKeywords) {
      if (response.includes(keyword)) {
        suggestedApproach = response.split(keyword)[1]?.split('\n\n')[0]?.trim() || '';
        if (suggestedApproach) break;
      }
    }
    
    // If no specific approach section found, use the whole response if it's substantial
    if (!suggestedApproach && response.length > 50) {
      // For longer responses, take more content or the whole response
      if (response.length > 500) {
        suggestedApproach = response.trim();
      } else {
        // Take first meaningful paragraph
        const paragraphs = response.split('\n\n').filter(p => p.trim().length > 20);
        suggestedApproach = paragraphs[0]?.trim() || '';
      }
    }
    
    // Debug: Log parsed results
    logger.info(`Parsed analysis for issue #${issue.number}:`, {
      filesToModify,
      suggestedApproach: suggestedApproach.substring(0, 100),
      canBeFixed: filesToModify.length > 0 && suggestedApproach.length > 0
    });
    
    // Build analysis data object
    return {
      issueType,
      filesToModify,
      estimatedComplexity,
      requiredContext: [],
      suggestedApproach,
      confidenceScore: 0.7,
      canBeFixed: (filesToModify.length > 0 || suggestedApproach.length > 50) && suggestedApproach.length > 0
    };
  } catch (error) {
    logger.error('Error parsing AI analysis response', error);
    
    // Return a fallback analysis with minimal data
    return {
      issueType: 'other',
      filesToModify: [],
      estimatedComplexity: 'medium',
      requiredContext: [],
      suggestedApproach: 'Unable to determine approach from AI analysis.',
      canBeFixed: false
    };
  }
}

/**
 * Extract files mentioned in the issue
 */
function extractFilesFromIssue(issue: IssueContext): string[] {
  const files: string[] = [];
  const fileRegex = /####\s*`([^`]+)`/g;
  let match;
  
  while ((match = fileRegex.exec(issue.body)) !== null) {
    files.push(match[1]);
  }
  
  return files;
}

/**
 * Determine the issue type from the issue context
 */
function determineIssueType(issue: IssueContext): IssueType {
  const title = issue.title.toLowerCase();
  const body = issue.body.toLowerCase();
  const combined = `${title} ${body}`;
  
  // Check for issue type from labels first
  for (const label of issue.labels) {
    if (label.toLowerCase().includes('bug')) return 'bug';
    if (label.toLowerCase().includes('feature')) return 'feature';
    if (label.toLowerCase().includes('refactor')) return 'refactoring';
    if (label.toLowerCase().includes('performance')) return 'performance';
    if (label.toLowerCase().includes('security')) return 'security';
    if (label.toLowerCase().includes('documentation')) return 'documentation';
    if (label.toLowerCase().includes('dependency')) return 'dependency';
    if (label.toLowerCase().includes('test')) return 'test';
  }
  
  // Check content patterns
  if (combined.includes('fix') || combined.includes('bug') || combined.includes('issue') || combined.includes('crash') || combined.includes('error')) {
    return 'bug';
  } else if (combined.includes('add') || combined.includes('new') || combined.includes('feature') || combined.includes('implement')) {
    return 'feature';
  } else if (combined.includes('refactor') || combined.includes('clean') || combined.includes('improve code')) {
    return 'refactoring';
  } else if (combined.includes('performance') || combined.includes('slow') || combined.includes('optimize') || combined.includes('speed')) {
    return 'performance';
  } else if (combined.includes('secur') || combined.includes('vulnerab') || combined.includes('hack') || combined.includes('attack')) {
    return 'security';
  } else if (combined.includes('document') || combined.includes('readme') || combined.includes('wiki') || combined.includes('comment')) {
    return 'documentation';
  } else if (combined.includes('dependency') || combined.includes('upgrade') || combined.includes('update') || combined.includes('package')) {
    return 'dependency';
  } else if (combined.includes('test') || combined.includes('spec') || combined.includes('unit test') || combined.includes('coverage')) {
    return 'test';
  }
  
  return 'other';
}