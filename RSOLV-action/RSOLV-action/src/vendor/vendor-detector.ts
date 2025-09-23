/**
 * RFC-047: Vendor Library Detection Implementation
 */

import { Library } from './types.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export class VendorDetector {
  private readonly VENDOR_PATTERNS = [
    'node_modules',
    'vendor',
    'bower_components',
    'jspm_packages',
    'packages',
    'third_party',
    'external',
    'libs',
    'dependencies',
    'dist'
  ];
  
  private readonly MINIFIED_PATTERNS = [
    '.min.js',
    '-min.js',
    '.bundle.js',
    '.min.css',
    '-min.css'
  ];
  
  private readonly VENDOR_INDICATORS = {
    filePatterns: [
      /jquery[.-]?([\d.]+)?(?:\.min)?\.js$/i,
      /bootstrap[.-]?([\d.]+)?(?:\.min)?\.(?:js|css)$/i,
      /angular[.-]?([\d.]+)?(?:\.min)?\.js$/i,
      /react[.-]?([\d.]+)?(?:\.min)?\.js$/i,
      /vue[.-]?([\d.]+)?(?:\.min)?\.js$/i,
      /lodash[.-]?([\d.]+)?(?:\.min)?\.js$/i,
      /moment[.-]?([\d.]+)?(?:\.min)?\.js$/i
    ],
    headerComments: [
      /\/\*!?\s*jQuery\s+v?([\d.]+)/i,
      /\/\*!?\s*Bootstrap\s+v?([\d.]+)/i,
      /\/\*!?\s*Angular\s+v?([\d.]+)/i,
      /\/\*!?\s*React\s+v?([\d.]+)/i,
      /\/\*!?\s*Vue\.js\s+v?([\d.]+)/i,
      /Copyright\s+\(c\)\s+.*\s+Foundation/i,
      /Licensed\s+under\s+MIT/i,
      /\/\*!?\s*\w+\.js\s+v?\d+\.\d+\.\d+/
    ]
  };

  async isVendorFile(filePath: string): Promise<boolean> {
    // Check if path contains vendor directory
    if (this.matchesVendorPattern(filePath)) {
      return true;
    }
    
    // Check if file is minified
    if (this.isMinified(filePath)) {
      return true;
    }
    
    // Check if filename matches known vendor libraries
    if (this.matchesKnownLibrary(filePath)) {
      return true;
    }
    
    return false;
  }
  
  async containsVendorIndicators(filePath: string, content?: string): Promise<boolean> {
    // If content provided, check header comments
    if (content) {
      return this.hasVendorHeader(content);
    }
    
    // Try to read file and check header
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      // Only check first 500 chars for performance
      const header = fileContent.substring(0, 500);
      return this.hasVendorHeader(header);
    } catch {
      return false;
    }
  }
  
  async identifyLibrary(filePath: string, content?: string): Promise<Library | null> {
    // First check if it's even a vendor file
    const isVendor = await this.isVendorFile(filePath) || 
                    (content && this.hasVendorHeader(content));
    
    if (!isVendor) {
      return null;
    }
    
    // Try to extract from content/header first if provided
    // (more accurate than path-based detection)
    if (content) {
      const headerInfo = this.extractFromHeader(content);
      if (headerInfo) {
        return headerInfo;
      }
    }
    
    // Fall back to path extraction
    const pathInfo = this.extractFromPath(filePath);
    if (pathInfo) {
      return pathInfo;
    }
    
    // Try to read file if no content provided
    if (!content) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const header = fileContent.substring(0, 500);
        return this.extractFromHeader(header);
      } catch {
        // Fall through
      }
    }
    
    // Generic vendor file without specific library info
    return {
      name: 'unknown-vendor',
      version: 'unknown'
    };
  }
  
  private matchesVendorPattern(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.VENDOR_PATTERNS.some(pattern => 
      normalizedPath.includes(`/${pattern}/`) || 
      normalizedPath.includes(`${pattern}/`)
    );
  }
  
  private isMinified(filePath: string): boolean {
    const filename = path.basename(filePath).toLowerCase();
    return this.MINIFIED_PATTERNS.some(pattern => 
      filename.includes(pattern)
    );
  }
  
  private matchesKnownLibrary(filePath: string): boolean {
    const filename = path.basename(filePath);
    return this.VENDOR_INDICATORS.filePatterns.some(pattern => 
      pattern.test(filename)
    );
  }
  
  private hasVendorHeader(content: string): boolean {
    return this.VENDOR_INDICATORS.headerComments.some(pattern => 
      pattern.test(content)
    );
  }
  
  private extractFromPath(filePath: string): Library | null {
    const filename = path.basename(filePath);
    
    // Try each known library pattern
    for (const pattern of this.VENDOR_INDICATORS.filePatterns) {
      const match = filename.match(pattern);
      if (match) {
        // Extract library name and version
        const libraryName = this.getLibraryNameFromPattern(pattern);
        const version = match[1] || 'unknown';
        
        return {
          name: libraryName,
          version: version
        };
      }
    }
    
    // Special case for files like jquery-3.6.0.min.js
    const versionMatch = filename.match(/^([\w-]+)[.-]([\d.]+)(?:\.min)?\.(?:js|css)$/);
    if (versionMatch) {
      return {
        name: versionMatch[1].toLowerCase(),
        version: versionMatch[2]
      };
    }
    
    return null;
  }
  
  private extractFromHeader(content: string): Library | null {
    // Special case for Bootstrap CSS with URL
    const bootstrapMatch = content.match(/\/\*!?\s*Bootstrap\s+v?([\d.]+)(?:\s+\([^)]+\))?/i);
    if (bootstrapMatch) {
      return {
        name: 'bootstrap',
        version: bootstrapMatch[1] || 'unknown'
      };
    }
    
    // Try each header pattern
    for (const pattern of this.VENDOR_INDICATORS.headerComments) {
      const match = content.match(pattern);
      if (match) {
        // Extract library name from the pattern
        const libraryName = this.getLibraryNameFromHeader(content, pattern);
        const version = match[1] || 'unknown';
        
        if (libraryName) {
          return {
            name: libraryName.toLowerCase(),
            version: version
          };
        }
      }
    }
    
    return null;
  }
  
  private getLibraryNameFromPattern(pattern: RegExp): string {
    const patternStr = pattern.source;
    // Extract library name from pattern (e.g., "jquery" from /jquery[.-]?[\d.]+/)
    const match = patternStr.match(/^(\w+)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }
  
  private getLibraryNameFromHeader(content: string, pattern: RegExp): string | null {
    const patternStr = pattern.source;
    
    // Special cases for known libraries
    if (patternStr.includes('jQuery')) return 'jquery';
    if (patternStr.includes('Bootstrap')) return 'bootstrap';
    if (patternStr.includes('Angular')) return 'angular';
    if (patternStr.includes('React')) return 'react';
    if (patternStr.includes('Vue')) return 'vue';
    
    // Try to extract from content
    const nameMatch = content.match(/\/\*!?\s*(\w+)(?:\.js)?\s+v/i);
    if (nameMatch) {
      return nameMatch[1].toLowerCase();
    }
    
    return null;
  }
}