/**
 * File Selector for ElixirASTAnalyzer
 * 
 * Intelligently selects up to 10 files for AST analysis based on:
 * - Security relevance
 * - Changed files (if available)
 * - Language distribution
 * - File size constraints
 */

import * as crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { FileSelectionOptions, SelectedFile } from './types.js';

interface FileInfo {
  path: string;
  content: string;
  size: number;
  language: string;
  isChanged?: boolean;
  securityScore?: number;
}

export class FileSelector {
  // Default exclude patterns
  private static readonly DEFAULT_EXCLUDE_PATTERNS = [
    /node_modules\//,
    /vendor\//,
    /\.git\//,
    /dist\//,
    /build\//,
    /coverage\//,
    /\.next\//,
    /\.nuxt\//,
    /test\/fixtures\//,
    /spec\/fixtures\//,
    /\.(min|bundle|packed)\./,
    /\.(png|jpg|jpeg|gif|svg|ico|pdf|zip|tar|gz)$/i
  ];

  // Security-relevant path patterns (higher priority)
  private static readonly SECURITY_PATTERNS = [
    /auth/i,
    /security/i,
    /crypto/i,
    /password/i,
    /token/i,
    /session/i,
    /api\//,
    /handlers?\//,
    /controllers?\//,
    /routes?\//,
    /middleware/i,
    /database/i,
    /models?\//,
    /user/i,
    /admin/i,
    /config/i
  ];

  // Test file patterns (lower priority)
  private static readonly TEST_PATTERNS = [
    /\.(test|spec)\./,
    /__(tests?|specs?)__\//,
    /test\//,
    /tests\//,
    /spec\//,
    /specs\//
  ];

  /**
   * Select files for analysis based on options
   */
  static selectFiles(
    files: Map<string, string>,
    options: FileSelectionOptions,
    changedFiles?: string[]
  ): SelectedFile[] {
    // Convert to FileInfo array
    const fileInfos = this.createFileInfos(files, changedFiles);

    // Apply filters
    let filtered = this.applyFilters(fileInfos, options);

    // Calculate security scores
    filtered = this.calculateSecurityScores(filtered);

    // Sort by priority
    const sorted = this.sortByPriority(filtered, options);

    // Select top N files
    const selected = sorted.slice(0, options.maxFiles);

    // Convert to SelectedFile format
    return selected.map(file => ({
      path: file.path,
      content: file.content,
      language: file.language,
      size: file.size,
      hash: crypto.createHash('sha256').update(file.content).digest('hex')
    }));
  }

  /**
   * Create FileInfo objects from file map
   */
  private static createFileInfos(
    files: Map<string, string>,
    changedFiles?: string[]
  ): FileInfo[] {
    const changedSet = new Set(changedFiles || []);
    const fileInfos: FileInfo[] = [];

    for (const [path, content] of files.entries()) {
      const language = this.detectLanguage(path);
      if (!language) continue; // Skip unknown file types

      fileInfos.push({
        path,
        content,
        size: Buffer.byteLength(content, 'utf8'),
        language,
        isChanged: changedSet.has(path)
      });
    }

    return fileInfos;
  }

  /**
   * Apply filters based on options
   */
  private static applyFilters(
    files: FileInfo[],
    options: FileSelectionOptions
  ): FileInfo[] {
    return files.filter(file => {
      // Check file size
      if (options.maxFileSize && file.size > options.maxFileSize) {
        logger.debug(`Skipping large file: ${file.path} (${file.size} bytes)`);
        return false;
      }

      // Check language filter
      if (options.languages && options.languages.length > 0) {
        if (!options.languages.includes(file.language)) {
          return false;
        }
      }

      // Check exclude patterns
      const excludePatterns = [
        ...this.DEFAULT_EXCLUDE_PATTERNS,
        ...(options.excludePatterns || [])
      ];

      for (const pattern of excludePatterns) {
        if (pattern.test(file.path)) {
          logger.debug(`Excluding file by pattern: ${file.path}`);
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Calculate security relevance scores
   */
  private static calculateSecurityScores(files: FileInfo[]): FileInfo[] {
    return files.map(file => {
      let score = 0;

      // Check if it's a test file (lower priority)
      const isTest = this.TEST_PATTERNS.some(pattern => pattern.test(file.path));
      if (isTest) {
        score -= 10;
      }

      // Check security-relevant paths
      const securityMatches = this.SECURITY_PATTERNS.filter(
        pattern => pattern.test(file.path)
      ).length;
      score += securityMatches * 5;

      // Check for security-relevant content patterns
      const contentPatterns = [
        /password|secret|token|api[_-]?key/i,
        /eval|exec|system|spawn/i,
        /innerHTML|dangerouslySetInnerHTML/i,
        /raw\s*\(|html_safe/i,
        /sql|query|database/i
      ];

      const contentMatches = contentPatterns.filter(
        pattern => pattern.test(file.content)
      ).length;
      score += contentMatches * 3;

      // Language-specific scoring
      switch (file.language) {
      case 'javascript':
      case 'typescript':
      case 'php':
      case 'ruby':
        score += 2; // Higher risk languages
        break;
      case 'python':
      case 'java':
        score += 1;
        break;
      }

      return { ...file, securityScore: score };
    });
  }

  /**
   * Sort files by priority
   */
  private static sortByPriority(
    files: FileInfo[],
    options: FileSelectionOptions
  ): FileInfo[] {
    return files.sort((a, b) => {
      // 1. Changed files first (if prioritizeChanges is true)
      if (options.prioritizeChanges) {
        if (a.isChanged && !b.isChanged) return -1;
        if (!a.isChanged && b.isChanged) return 1;
      }

      // 2. Security score
      const scoreDiff = (b.securityScore || 0) - (a.securityScore || 0);
      if (scoreDiff !== 0) return scoreDiff;

      // 3. File size (smaller files first for faster processing)
      return a.size - b.size;
    });
  }

  /**
   * Detect language from file extension
   */
  private static detectLanguage(path: string): string | null {
    const ext = path.split('.').pop()?.toLowerCase();

    switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'java':
      return 'java';
    case 'ex':
    case 'exs':
      return 'elixir';
    default:
      return null;
    }
  }

  /**
   * Get a diverse selection of files across languages
   */
  static selectDiverseFiles(
    files: Map<string, string>,
    options: FileSelectionOptions
  ): SelectedFile[] {
    // Group files by language
    const filesByLanguage = new Map<string, FileInfo[]>();
    const fileInfos = this.createFileInfos(files);
    const filtered = this.applyFilters(fileInfos, options);

    for (const file of filtered) {
      const langFiles = filesByLanguage.get(file.language) || [];
      langFiles.push(file);
      filesByLanguage.set(file.language, langFiles);
    }

    // Calculate how many files per language
    const languageCount = filesByLanguage.size;
    const filesPerLanguage = Math.max(1, Math.floor(options.maxFiles / languageCount));
    const extraSlots = options.maxFiles - (filesPerLanguage * languageCount);

    // Select files from each language
    const selected: FileInfo[] = [];
    let extraAdded = 0;

    for (const [language, langFiles] of filesByLanguage) {
      // Sort by security score
      const sorted = this.calculateSecurityScores(langFiles)
        .sort((a, b) => (b.securityScore || 0) - (a.securityScore || 0));

      // Take base amount plus extra if available
      const takeCount = filesPerLanguage + (extraAdded < extraSlots ? 1 : 0);
      if (takeCount > filesPerLanguage) extraAdded++;

      selected.push(...sorted.slice(0, takeCount));
    }

    // Convert to SelectedFile format
    return selected.slice(0, options.maxFiles).map(file => ({
      path: file.path,
      content: file.content,
      language: file.language,
      size: file.size,
      hash: crypto.createHash('sha256').update(file.content).digest('hex')
    }));
  }
}