import { loadConfig } from './config/index.js';
import { detectIssuesFromAllPlatforms } from './platforms/issue-detector.js';
import { securityCheck } from './utils/security.js';
import { logger } from './utils/logger.js';
import { processIssues } from './ai/unified-processor.js';
import { setupContainer } from './containers/setup.js';
import { ActionStatus } from './types/index.js';
import { ScanOrchestrator } from './scanner/index.js';
import { getRepositoryDetails } from './github/api.js';
import { getExecutionMode, getModeDescription } from './utils/mode-selector.js';
import { PhaseExecutor } from './modes/phase-executor/index.js';

async function run(): Promise<ActionStatus> {
  try {
    // Log startup information
    logger.info('Starting RSOLV action v2.0 - Enhanced Logging Active');
    logger.info(`Build timestamp: ${new Date().toISOString()}`);
    
    // Load configuration
    const config = await loadConfig();
    logger.info('Configuration loaded successfully');
    
    // Get execution mode using new mode selector
    const mode = getExecutionMode();
    logger.info(`Execution mode: ${mode} - ${getModeDescription(mode)}`);
    
    // Handle three-phase modes
    if (mode === 'scan' || mode === 'validate' || mode === 'mitigate' || mode === 'full') {
      const executor = new PhaseExecutor(config);
      
      // Get repository information
      const repoFullName = process.env.GITHUB_REPOSITORY;
      if (!repoFullName) {
        throw new Error('GITHUB_REPOSITORY environment variable not set');
      }
      
      const [owner, name] = repoFullName.split('/');
      const repoDetails = await getRepositoryDetails(owner, name);
      
      // Execute the selected mode
      const result = await executor.execute(mode, {
        repository: {
          owner,
          name,
          defaultBranch: repoDetails.defaultBranch || 'main'
        },
        issueNumber: process.env.RSOLV_ISSUE_NUMBER ? parseInt(process.env.RSOLV_ISSUE_NUMBER) : undefined
      });
      
      // Set outputs for GitHub Actions
      if (process.env.GITHUB_OUTPUT) {
        const fs = await import('fs');
        const outputFile = process.env.GITHUB_OUTPUT;

        // Set generic phase_results output
        if (result.data) {
          fs.appendFileSync(outputFile, `phase_results=${JSON.stringify(result)}\n`);
        }

        // Set specific outputs based on mode
        if (mode === 'scan' && result.data) {
          const scanData = result.data as any;
          if (scanData.createdIssues) {
            fs.appendFileSync(outputFile, `created_issues=${JSON.stringify(scanData.createdIssues)}\n`);
            fs.appendFileSync(outputFile, `issues_created=${scanData.createdIssues.length}\n`);
          }
          if (scanData.vulnerabilities) {
            fs.appendFileSync(outputFile, `scan_results=${JSON.stringify(scanData.vulnerabilities)}\n`);
            fs.appendFileSync(outputFile, `security_findings=${JSON.stringify(scanData.vulnerabilities)}\n`);
          }
        }
      }
      
      return {
        success: result.success,
        message: result.message || `${mode} phase completed`
      };
    }
    
    // If we get here, the mode wasn't handled
    throw new Error(`Unsupported mode: ${mode}. Supported modes: scan, validate, mitigate, full`);
  } catch (error) {
    logger.error('Action failed', error);
    return { 
      success: false, 
      message: `RSOLV action failed: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

// Start the action
run().then(status => {
  if (status.success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
