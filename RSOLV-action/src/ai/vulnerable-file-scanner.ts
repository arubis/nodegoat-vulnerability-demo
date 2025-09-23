/**
 * Vulnerable File Scanner
 * 
 * Scans for common files that often contain vulnerabilities
 * to provide context for test generation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

// Common patterns for files that often have vulnerabilities
const VULNERABLE_PATTERNS = [
  // Authentication/Security
  'auth', 'login', 'session', 'password', 'token', 'crypto',
  // Data handling
  'database', 'query', 'sql', 'db',
  // Web endpoints
  'route', 'controller', 'handler', 'api', 'endpoint',
  // User input
  'form', 'input', 'upload', 'search',
  // Configuration
  'config', 'settings', 'env'
];

// File extensions by language
const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  javascript: ['.js', '.jsx'],
  typescript: ['.ts', '.tsx'],
  python: ['.py'],
  ruby: ['.rb'],
  php: ['.php'],
  java: ['.java'],
  elixir: ['.ex', '.exs']
};

/**
 * Get vulnerable files from the codebase
 */
export async function getVulnerableFiles(
  rootDir: string,
  maxFiles: number = 10
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  
  try {
    // Find files matching vulnerable patterns
    const candidates = await findVulnerableFiles(rootDir);
    
    // Sort by relevance score
    const scored = candidates.map(file => ({
      path: file,
      score: calculateRelevanceScore(file)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    // Read top files
    for (const { path: filePath } of scored.slice(0, maxFiles)) {
      try {
        const relativePath = path.relative(rootDir, filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        files.set(relativePath, content);
        logger.debug(`Added vulnerable file candidate: ${relativePath}`);
      } catch (error) {
        logger.debug(`Could not read file ${filePath}:`, error);
      }
    }
    
  } catch (error) {
    logger.warn('Error scanning for vulnerable files:', error);
  }
  
  return files;
}

/**
 * Find files that match vulnerable patterns
 */
async function findVulnerableFiles(
  dir: string,
  files: string[] = [],
  depth: number = 0
): Promise<string[]> {
  // Limit depth to avoid deep recursion
  if (depth > 3) return files;
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip common non-source directories
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'vendor', 'coverage'].includes(entry.name)) {
          continue;
        }
        await findVulnerableFiles(fullPath, files, depth + 1);
      } else if (entry.isFile()) {
        // Check if file has relevant extension
        const ext = path.extname(entry.name).toLowerCase();
        const isSourceFile = Object.values(LANGUAGE_EXTENSIONS).flat().includes(ext);
        
        if (isSourceFile && matchesVulnerablePattern(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
  
  return files;
}

/**
 * Check if filename matches vulnerable patterns
 */
function matchesVulnerablePattern(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VULNERABLE_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * Calculate relevance score for a file
 */
function calculateRelevanceScore(filePath: string): number {
  let score = 0;
  const lower = filePath.toLowerCase();
  
  // Higher score for more specific vulnerable patterns
  if (lower.includes('auth')) score += 10;
  if (lower.includes('login')) score += 10;
  if (lower.includes('password')) score += 8;
  if (lower.includes('token')) score += 8;
  if (lower.includes('sql') || lower.includes('query')) score += 7;
  if (lower.includes('upload')) score += 7;
  if (lower.includes('controller') || lower.includes('handler')) score += 5;
  if (lower.includes('route')) score += 4;
  if (lower.includes('api')) score += 4;
  if (lower.includes('config')) score += 3;
  
  // Lower score for test files
  if (lower.includes('test') || lower.includes('spec')) score -= 5;
  
  return score;
}