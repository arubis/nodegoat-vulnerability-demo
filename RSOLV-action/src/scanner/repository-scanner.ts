import { SecurityDetectorV2 } from '../security/detector-v2.js';
import { getGitHubClient } from '../github/api.js';
import { logger } from '../utils/logger.js';
import type { FileToScan, ScanConfig, ScanResult, VulnerabilityGroup } from './types.js';
import type { Vulnerability } from '../security/types.js';
import { createPatternSource } from '../security/pattern-source.js';
import { ASTValidator } from './ast-validator.js';
import { VendorDetector } from '../vendor/vendor-detector.js';

export class RepositoryScanner {
  private detector: SecurityDetectorV2;
  private github: ReturnType<typeof getGitHubClient>;
  private vendorDetector: VendorDetector;

  constructor() {
    this.detector = new SecurityDetectorV2(createPatternSource());
    this.github = getGitHubClient();
    this.vendorDetector = new VendorDetector();
  }

  async scan(config: ScanConfig): Promise<ScanResult> {
    logger.info(`Starting vulnerability scan for ${config.repository.owner}/${config.repository.name}`);
    
    const startTime = Date.now();
    const files = await this.getRepositoryFiles(config);
    let vulnerabilities: Vulnerability[] = [];
    
    logger.info(`Found ${files.length} files to scan`);
    
    // Scan each file with progress logging
    logger.info(`Starting vulnerability detection on ${files.length} files...`);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Log progress every 10 files or on first/last file
      if (i === 0 || i === files.length - 1 || (i + 1) % 10 === 0) {
        logger.info(`Scanning progress: ${i + 1}/${files.length} files (${file.path})`);
      }
      
      if (file.language && this.isSupportedLanguage(file.language)) {
        try {
          // Check if this is a vendor file
          const isVendorFile = await this.vendorDetector.isVendorFile(file.path);

          if (isVendorFile) {
            logger.info(`Detected vendor file: ${file.path}`);
          }

          const fileVulnerabilities = await this.detector.detect(file.content, file.language);

          // Add file path and vendor flag to each vulnerability
          fileVulnerabilities.forEach(vuln => {
            vuln.filePath = file.path;
            vuln.isVendor = isVendorFile;
          });

          vulnerabilities.push(...fileVulnerabilities);

          if (fileVulnerabilities.length > 0) {
            const vendorNote = isVendorFile ? ' (vendor file)' : '';
            logger.info(`Found ${fileVulnerabilities.length} vulnerabilities in ${file.path}${vendorNote}`);
          }
        } catch (error) {
          logger.error(`Error scanning file ${file.path}:`, error);
        }
      }
    }
    
    logger.info(`Scanning complete. Total vulnerabilities found: ${vulnerabilities.length}`);
    
    // Apply AST validation if enabled (default is true)
    if (config.enableASTValidation !== false && config.rsolvApiKey && typeof config.rsolvApiKey === 'string' && config.rsolvApiKey.length > 0) {
      logger.info('Performing AST validation on detected vulnerabilities (enabled by default)...');
      const validator = new ASTValidator(config.rsolvApiKey);
      
      // Create file contents map
      const fileContents = new Map<string, string>();
      files.forEach(f => fileContents.set(f.path, f.content));
      
      const preValidationCount = vulnerabilities.length;
      vulnerabilities = await validator.validateVulnerabilities(vulnerabilities, fileContents);
      const filtered = preValidationCount - vulnerabilities.length;
      
      logger.info(`AST validation complete: ${filtered} false positives filtered out`);
    } else if (config.enableASTValidation !== false) {
      logger.warn('AST validation is enabled but skipped - missing RSOLV API key');
    }
    
    // Log vendor vs application vulnerability breakdown
    const vendorVulns = vulnerabilities.filter(v => v.isVendor);
    const appVulns = vulnerabilities.filter(v => !v.isVendor);
    logger.info(`Vulnerability breakdown: ${appVulns.length} in application code, ${vendorVulns.length} in vendor files`);

    // Group vulnerabilities by type
    const groupedVulnerabilities = this.groupVulnerabilities(vulnerabilities);

    const scanTime = Date.now() - startTime;
    logger.info(`Scan completed in ${scanTime}ms. Found ${vulnerabilities.length} vulnerabilities`);
    
    return {
      repository: `${config.repository.owner}/${config.repository.name}`,
      branch: config.repository.defaultBranch,
      scanDate: new Date().toISOString(),
      totalFiles: files.length,
      scannedFiles: files.filter(f => f.language && this.isSupportedLanguage(f.language)).length,
      vulnerabilities,
      groupedVulnerabilities,
      createdIssues: [] // Will be populated if issues are created
    };
  }

  private async getRepositoryFiles(config: ScanConfig): Promise<FileToScan[]> {
    const files: FileToScan[] = [];
    
    try {
      // Get repository tree
      const { data: tree } = await this.github.git.getTree({
        owner: config.repository.owner,
        repo: config.repository.name,
        tree_sha: config.repository.defaultBranch,
        recursive: '1'
      });
      
      // Filter for code files only
      const codeFiles = tree.tree.filter(item => 
        item.type === 'blob' && 
        item.path && 
        this.isCodeFile(item.path) &&
        item.size && item.size < 1000000 // Skip files larger than 1MB
      );
      
      // Fetch content for each file with progress logging
      logger.info(`Fetching content for ${codeFiles.length} code files...`);
      
      for (let i = 0; i < codeFiles.length; i++) {
        const file = codeFiles[i];
        if (!file.path || !file.sha) continue;
        
        // Log progress every 10 files or on first/last file
        if (i === 0 || i === codeFiles.length - 1 || (i + 1) % 10 === 0) {
          logger.info(`Progress: ${i + 1}/${codeFiles.length} files fetched (${file.path})`);
        }
        
        try {
          const { data: blob } = await this.github.git.getBlob({
            owner: config.repository.owner,
            repo: config.repository.name,
            file_sha: file.sha
          });
          
          // Decode base64 content
          const content = Buffer.from(blob.content, 'base64').toString('utf-8');
          const language = this.detectLanguage(file.path);
          
          if (language) {
            files.push({
              path: file.path,
              content,
              language
            });
          }
        } catch (error) {
          logger.error(`Error fetching content for ${file.path}:`, error);
        }
      }
      
      logger.info(`Completed fetching ${files.length} files with supported languages`);
    } catch (error) {
      logger.error('Error getting repository files:', error);
      throw error;
    }
    
    return files;
  }

  private isCodeFile(path: string): boolean {
    const codeExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
      '.py', '.pyw',
      '.rb', '.rake',
      '.java',
      '.php', '.phtml',
      '.ex', '.exs'
    ];
    
    return codeExtensions.some(ext => path.endsWith(ext));
  }

  private detectLanguage(path: string): string | null {
    const extensionMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.pyw': 'python',
      '.rb': 'ruby',
      '.rake': 'ruby',
      '.java': 'java',
      '.php': 'php',
      '.phtml': 'php',
      '.ex': 'elixir',
      '.exs': 'elixir'
    };
    
    const extension = path.substring(path.lastIndexOf('.'));
    return extensionMap[extension] || null;
  }

  private isSupportedLanguage(language: string): boolean {
    const supported = ['javascript', 'typescript', 'python', 'ruby', 'java', 'php', 'elixir'];
    return supported.includes(language.toLowerCase());
  }

  private groupVulnerabilities(vulnerabilities: Vulnerability[]): VulnerabilityGroup[] {
    const groups = new Map<string, VulnerabilityGroup>();

    for (const vuln of vulnerabilities) {
      // Group vendor and application vulnerabilities separately
      const vendorSuffix = vuln.isVendor ? '-vendor' : '-app';
      const key = `${vuln.type}-${vuln.severity}${vendorSuffix}`;

      if (!groups.has(key)) {
        groups.set(key, {
          type: vuln.type,
          severity: vuln.severity,
          count: 0,
          files: [],
          vulnerabilities: [],
          isVendor: vuln.isVendor || false
        });
      }

      const group = groups.get(key)!;
      group.count++;
      group.vulnerabilities.push(vuln);

      if (vuln.filePath && !group.files.includes(vuln.filePath)) {
        group.files.push(vuln.filePath);
      }
    }
    
    // Sort groups by severity and count
    return Array.from(groups.values()).sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      const severityDiff = severityOrder[a.severity as keyof typeof severityOrder] - 
                           severityOrder[b.severity as keyof typeof severityOrder];
      
      return severityDiff !== 0 ? severityDiff : b.count - a.count;
    });
  }
}