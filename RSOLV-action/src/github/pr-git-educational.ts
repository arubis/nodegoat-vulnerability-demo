/**
 * Educational PR creation with comprehensive security education
 * Implements RSOLV's mission to educate while fixing
 */

import { IssueContext, ActionConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getGitHubClient } from './api.js';
import { execSync } from 'child_process';
import { RsolvApiClient } from '../external/api-client.js';

/**
 * Enhanced PR result with educational content
 */
export interface EducationalPrResult {
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  branchName?: string;
  commitHash?: string;
  educationalContent?: string;
  error?: string;
}

/**
 * Vulnerability education database
 */
const VULNERABILITY_EDUCATION: Record<string, {
  title: string;
  description: string;
  prevention: string;
  example?: string;
}> = {
  XSS: {
    title: 'Cross-Site Scripting (XSS)',
    description: 'XSS allows attackers to inject malicious scripts into web pages viewed by other users. This can lead to session hijacking, defacement, or redirection to malicious sites.',
    prevention: 'Always sanitize user input, use Content Security Policy (CSP), encode output, and validate input on both client and server sides.',
    example: '`<script>alert("XSS")</script>` becomes `&lt;script&gt;alert("XSS")&lt;/script&gt;`'
  },
  SQLi: {
    title: 'SQL Injection',
    description: 'SQL injection allows attackers to interfere with database queries, potentially reading sensitive data, modifying database data, or executing administrative operations.',
    prevention: 'Use parameterized queries/prepared statements, validate input types, apply least privilege principle to database accounts, and avoid dynamic SQL construction.',
    example: 'Instead of `query("SELECT * FROM users WHERE id = " + userId)`, use parameterized: `query("SELECT * FROM users WHERE id = ?", [userId])`'
  },
  slopsquatting: {
    title: 'Slopsquatting (AI-Specific Vulnerability)',
    description: 'Slopsquatting exploits AI code generation tools that hallucinate non-existent package names. Attackers register these packages to inject malicious code. Our research shows 19.6% of AI package suggestions are hallucinated.',
    prevention: 'Always verify package existence before adding dependencies, use package registries with verification, and implement dependency scanning in CI/CD pipelines.',
    example: 'AI might suggest `import { validateInput } from "secure-validator"` where "secure-validator" doesn\'t exist, allowing attackers to register it.'
  },
  CSRF: {
    title: 'Cross-Site Request Forgery (CSRF)',
    description: 'CSRF tricks authenticated users into executing unwanted actions. An attacker can force users to perform state-changing requests like transferring funds or changing email addresses.',
    prevention: 'Implement anti-CSRF tokens, use SameSite cookie attribute, verify Origin/Referer headers, and require re-authentication for sensitive actions.'
  },
  XXE: {
    title: 'XML External Entity (XXE) Injection',
    description: 'XXE attacks exploit vulnerabilities in XML parsers to access local or remote files, perform SSRF attacks, or cause denial of service.',
    prevention: 'Disable external entity processing in XML parsers, use less complex data formats like JSON when possible, and validate/sanitize XML input.'
  }
};

/**
 * Create an educational pull request with comprehensive security education
 */
export async function createEducationalPullRequest(
  issue: IssueContext,
  commitHash: string,
  summary: {
    title: string;
    description: string;
    vulnerabilityType?: string;
    severity?: string;
    cwe?: string;
    tests?: string[];
    isAiGenerated?: boolean;
    isTestMode?: boolean;
    validationFailed?: boolean;
    testModeNote?: string;
  },
  config: ActionConfig,
  diffStats?: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  }
): Promise<EducationalPrResult> {
  try {
    logger.info(`Creating educational PR from commit ${commitHash.substring(0, 8)} for issue #${issue.number}`);
    
    // Configure git user if not set
    try {
      execSync('git config user.email', { cwd: process.cwd() });
    } catch {
      logger.info('Configuring git user for GitHub Actions');
      execSync('git config user.email "rsolv@users.noreply.github.com"', { cwd: process.cwd() });
      execSync('git config user.name "RSOLV Bot"', { cwd: process.cwd() });
    }
    
    // Create and checkout branch
    const branchName = `rsolv/fix-issue-${issue.number}`;
    try {
      execSync(`git checkout -b ${branchName}`, { cwd: process.cwd() });
      logger.info(`Created branch: ${branchName}`);
    } catch (error) {
      // Branch might already exist
      execSync(`git checkout ${branchName}`, { cwd: process.cwd() });
      logger.info(`Switched to existing branch: ${branchName}`);
    }
    
    // Configure git authentication if token is available
    const token = process.env.GITHUB_TOKEN || process.env.GH_PAT;
    if (token && process.env.GITHUB_REPOSITORY) {
      const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
      const authenticatedUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
      try {
        execSync(`git remote set-url origin ${authenticatedUrl}`, { cwd: process.cwd() });
        logger.debug('Configured git authentication for push');
      } catch (configError) {
        logger.debug('Could not configure authenticated remote');
      }
    }

    // Push the branch with better error handling
    try {
      execSync(`git push -u origin ${branchName}`, { cwd: process.cwd() });
      logger.info(`Pushed branch: ${branchName}`);
    } catch (error: any) {
      const errorMessage = error.message || String(error);

      // If branch already exists or updates rejected, try force push
      if (errorMessage.includes('Updates were rejected') ||
          errorMessage.includes('already exists') ||
          errorMessage.includes('non-fast-forward')) {
        logger.info('Branch exists on remote, attempting force push');
        try {
          execSync(`git push -f origin ${branchName}`, { cwd: process.cwd() });
          logger.info(`Force pushed branch: ${branchName}`);
        } catch (forcePushError) {
          logger.error('Force push also failed', forcePushError);
          throw forcePushError;
        }
      } else {
        // Log full error for debugging
        logger.error('Failed to push branch', { error: errorMessage, branch: branchName });
        throw error;
      }
    }
    
    // Generate educational content
    const educationalContent = generateEducationalContent(summary, issue);
    
    // Generate comprehensive PR body
    const prBody = generateEducationalPrBody(issue, summary, educationalContent, diffStats);
    
    // Create the pull request
    const github = getGitHubClient();
    const [owner, repo] = issue.repository.fullName.split('/');
    
    try {
      const prTitlePrefix = summary.isTestMode && summary.validationFailed ? '[TEST MODE] ' : '';
      const { data: pullRequest } = await github.pulls.create({
        owner,
        repo,
        title: `${prTitlePrefix}[RSOLV] ${summary.title} (fixes #${issue.number})`,
        body: prBody,
        head: branchName,
        base: issue.repository.defaultBranch || 'main',
        maintainer_can_modify: true
      });
      
      logger.info(`Created educational pull request #${pullRequest.number}: ${pullRequest.html_url}`);
      
      // Track in RSOLV API
      if (config.rsolvApiKey) {
        try {
          const apiClient = new RsolvApiClient(config.rsolvApiKey);
          await apiClient.createFixAttempt({
            issueId: issue.id,
            issueNumber: issue.number,
            repository: issue.repository.fullName,
            pullRequestUrl: pullRequest.html_url,
            pullRequestNumber: pullRequest.number,
            branchName,
            commitHash,
            metadata: {
              hasEducationalContent: true,
              vulnerabilityType: summary.vulnerabilityType,
              severity: summary.severity
            }
          });
          logger.info('Tracked educational fix in RSOLV API');
        } catch (apiError) {
          logger.warn('Failed to track in RSOLV API', apiError);
        }
      }
      
      return {
        success: true,
        message: `Created educational pull request #${pullRequest.number}`,
        pullRequestUrl: pullRequest.html_url,
        pullRequestNumber: pullRequest.number,
        branchName,
        commitHash,
        educationalContent
      };
      
    } catch (error: any) {
      // Check if PR already exists
      if (error.status === 422 && error.message?.includes('pull request already exists')) {
        logger.warn('Pull request already exists for this branch');
        
        const { data: pulls } = await github.pulls.list({
          owner,
          repo,
          head: `${owner}:${branchName}`,
          state: 'open'
        });
        
        if (pulls.length > 0) {
          const existingPr = pulls[0];
          return {
            success: true,
            message: `Pull request already exists: #${existingPr.number}`,
            pullRequestUrl: existingPr.html_url,
            pullRequestNumber: existingPr.number,
            branchName,
            commitHash,
            educationalContent
          };
        }
      }
      
      throw error;
    }
    
  } catch (error) {
    logger.error('Failed to create educational pull request', error);
    return {
      success: false,
      message: 'Failed to create pull request',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Generate educational content based on vulnerability type
 */
function generateEducationalContent(
  summary: {
    vulnerabilityType?: string;
    isAiGenerated?: boolean;
  },
  issue: IssueContext
): string {
  const sections: string[] = [];
  
  // Get vulnerability education
  const vulnType = summary.vulnerabilityType?.toUpperCase() || 'SECURITY';
  const education = VULNERABILITY_EDUCATION[vulnType] || VULNERABILITY_EDUCATION.XSS;
  
  sections.push(`## What is ${education.title}?`);
  sections.push(education.description);
  sections.push('');
  sections.push('## How this fix prevents the vulnerability:');
  sections.push(education.prevention);
  if (education.example) {
    sections.push('');
    sections.push('**Example:**');
    sections.push(education.example);
  }
  sections.push('');
  sections.push('## Best practices:');
  sections.push('- Always validate and sanitize user input');
  sections.push('- Apply the principle of least privilege');
  sections.push('- Keep dependencies updated');
  sections.push('- Implement security headers');
  sections.push('- Use security linters and scanners in CI/CD');
  
  // AI-specific context if applicable
  if (summary.isAiGenerated || vulnType === 'SLOPSQUATTING') {
    sections.push('');
    sections.push('## 🤖 AI-Specific Vulnerability Context');
    sections.push('This vulnerability is related to AI-generated code. Our research shows:');
    sections.push('- 19.6% of AI package suggestions are hallucinated (non-existent)');
    sections.push('- Attackers actively exploit these by registering malicious packages');
    sections.push('- Always verify package existence before adding dependencies');
  }
  
  // RSOLV value proposition
  sections.push('');
  sections.push('## About RSOLV');
  sections.push('RSOLV automatically fixes security vulnerabilities, not just detects them.');
  sections.push('- 181 patterns across 8 languages and frameworks');
  sections.push('- Success-based pricing: only pay for deployed fixes');
  sections.push('- Detects AI-specific vulnerabilities others miss');
  sections.push('- AST-based analysis for minimal false positives');
  
  return sections.join('\n');
}

/**
 * Generate educational PR body with all components
 */
function generateEducationalPrBody(
  issue: IssueContext,
  summary: {
    title: string;
    description: string;
    vulnerabilityType?: string;
    severity?: string;
    cwe?: string;
    tests?: string[];
    isTestMode?: boolean;
    validationFailed?: boolean;
    testModeNote?: string;
  },
  educationalContent: string,
  diffStats?: {
    insertions: number;
    deletions: number;
    filesChanged: number;
  }
): string {
  const sections: string[] = [];
  
  // Header
  const titlePrefix = summary.isTestMode && summary.validationFailed ? '[TEST MODE] ' : '';
  sections.push(`# ${titlePrefix}${summary.title}`);
  sections.push('');

  // Test mode warning if validation failed
  if (summary.isTestMode && summary.validationFailed) {
    sections.push('> ⚠️ **TEST MODE**: This PR was created despite validation failures to allow inspection of the attempted fix.');
    sections.push('> ');
    if (summary.testModeNote) {
      sections.push(`> **Validation Issue:** ${summary.testModeNote}`);
    }
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  sections.push(`**Fixes:** #${issue.number}`);
  sections.push(`**Severity:** ${summary.severity || 'Medium'}`);
  if (summary.cwe) {
    sections.push(`**CWE:** ${summary.cwe}`);
  }
  sections.push('');
  
  // Summary
  sections.push('## 📝 Summary');
  sections.push(summary.description);
  sections.push('');
  
  // Changes Made
  if (diffStats && diffStats.filesChanged > 0) {
    sections.push('## 📊 Changes Made');
    sections.push(`- **Files Changed:** ${diffStats.filesChanged}`);
    sections.push(`- **Lines Added:** +${diffStats.insertions}`);
    sections.push(`- **Lines Removed:** -${diffStats.deletions}`);
    sections.push('');
  }
  
  // Educational Content
  sections.push('## 📚 Understanding This Fix');
  sections.push('');
  const vulnType = summary.vulnerabilityType?.toUpperCase() || 'SECURITY';
  const education = VULNERABILITY_EDUCATION[vulnType] || VULNERABILITY_EDUCATION.XSS;
  
  sections.push(`### 🛡️ What is ${education.title}?`);
  sections.push(education.description);
  sections.push('');
  
  sections.push('### 🔧 How This Fix Works');
  sections.push(education.prevention);
  if (education.example) {
    sections.push('');
    sections.push('**Example:**');
    sections.push('```');
    sections.push(education.example);
    sections.push('```');
  }
  sections.push('');
  
  sections.push('### ✅ Best Practices');
  sections.push('1. Always validate and sanitize user input');
  sections.push('2. Apply the principle of least privilege');
  sections.push('3. Keep dependencies updated');
  sections.push('4. Implement security headers');
  sections.push('5. Use security linters and scanners in CI/CD');
  sections.push('');
  
  // Testing Instructions
  if (summary.tests && summary.tests.length > 0) {
    sections.push('## 🧪 Testing Instructions');
    summary.tests.forEach((test, index) => {
      sections.push(`${index + 1}. ${test}`);
    });
    sections.push('');
  }
  
  // Review Checklist
  sections.push('## ✔️ Review Checklist');
  sections.push('- [ ] Changes fix the reported vulnerability');
  sections.push('- [ ] No new vulnerabilities introduced');
  sections.push('- [ ] Existing functionality preserved');
  sections.push('- [ ] Code follows project conventions');
  sections.push('- [ ] Tests pass (if applicable)');
  sections.push('');
  
  // About RSOLV
  sections.push('## 🤖 About RSOLV');
  sections.push('');
  sections.push('[RSOLV](https://rsolv.dev) automatically fixes security vulnerabilities in your code.');
  sections.push('');
  sections.push('**What makes RSOLV different:**');
  sections.push('- 🔧 **Fixes, not just reports:** We generate working code, not just vulnerability lists');
  sections.push('- 💰 **Success-based pricing:** Only pay for fixes that get deployed');
  sections.push('- 🤖 **AI-aware security:** Detect vulnerabilities specific to AI-generated code');
  sections.push('- 🎯 **181+ patterns:** Comprehensive coverage across 8 languages and frameworks');
  sections.push('- 🌳 **AST-based analysis:** Minimal false positives through syntax tree parsing');
  sections.push('');
  
  // Footer
  sections.push('---');
  sections.push('');
  sections.push('*This PR was automatically generated by [RSOLV](https://rsolv.dev) using direct file editing.*');
  sections.push(`*Learn more about ${education.title} on [OWASP](https://owasp.org)*`);
  
  return sections.join('\n');
}