/**
 * RFC-047: Vendor Library Detection Integration
 */

import { VendorDetector } from './vendor-detector.js';
import { DependencyAnalyzer } from './dependency-analyzer.js';
import { VendorVulnerabilityHandler } from './vulnerability-handler.js';
import { UpdateRecommender } from './update-recommender.js';

export class VendorDetectionIntegration {
  private detector: VendorDetector;
  private analyzer: DependencyAnalyzer;
  private handler: VendorVulnerabilityHandler;
  private recommender: UpdateRecommender;
  
  constructor() {
    this.detector = new VendorDetector();
    this.analyzer = new DependencyAnalyzer();
    this.handler = new VendorVulnerabilityHandler(this.detector, this.analyzer);
    this.recommender = new UpdateRecommender();
  }
  
  /**
   * Check if a file is a vendor library file
   */
  async isVendorFile(filePath: string): Promise<boolean> {
    return this.detector.isVendorFile(filePath);
  }
  
  /**
   * Process a vulnerability that involves vendor files
   */
  async processVulnerability(vulnerability: any): Promise<any> {
    console.log(`[VendorDetectionIntegration] Processing vendor vulnerability`);
    
    // Identify the library
    const vendorFiles = vulnerability.vendorFiles || [];
    const library = await this.identifyLibrary(vendorFiles[0]);
    
    // Get update recommendation
    const recommendation = await this.recommender.recommendUpdate(library, vulnerability);
    
    // Create issue for vendor update
    return {
      action: 'issue_created',
      type: 'vendor_update',
      library: library.name,
      currentVersion: library.version,
      recommendedVersion: recommendation.minimumSafeVersion,
      updateCommand: recommendation.updateStrategies[0]?.command,
      message: `Vendor library ${library.name} needs update from ${library.version} to ${recommendation.minimumSafeVersion}`,
      recommendation
    };
  }
  
  /**
   * Identify library from file path
   */
  private async identifyLibrary(filePath: string): Promise<any> {
    // Extract library name from path
    const parts = filePath.split('/');
    let name = 'unknown';
    let version = 'unknown';
    
    if (filePath.includes('jquery')) {
      name = 'jquery';
      // Try to extract version from filename
      const versionMatch = filePath.match(/jquery[.-]?([\d.]+)/);
      if (versionMatch) {
        version = versionMatch[1];
      }
    } else if (filePath.includes('bootstrap')) {
      name = 'bootstrap';
      const versionMatch = filePath.match(/bootstrap[.-]?([\d.]+)/);
      if (versionMatch) {
        version = versionMatch[1];
      }
    } else if (filePath.includes('node_modules/')) {
      // Extract from node_modules path
      const moduleMatch = filePath.match(/node_modules\/([^/]+)/);
      if (moduleMatch) {
        name = moduleMatch[1];
      }
    }
    
    return { name, version, path: filePath };
  }
}