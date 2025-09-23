/**
 * RFC-047: Vendor Library Detection - Main Export
 */

export * from './types.js';
export { VendorDetector } from './vendor-detector.js';
export { DependencyAnalyzer } from './dependency-analyzer.js';
export { VendorVulnerabilityHandler } from './vulnerability-handler.js';
export { UpdateRecommender } from './update-recommender.js';
export { VendorDetectionIntegration } from './integration.js';
export { VendorIssueCreator } from './issue-creator.js';