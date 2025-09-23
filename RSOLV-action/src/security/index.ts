// Export the new detector and pattern system
export { SecurityDetectorV2 } from './detector-v2.js';
export { 
  LocalPatternSource,
  ApiPatternSource, 
  HybridPatternSource,
  createPatternSource 
} from './pattern-source.js';
export type { PatternSource } from './pattern-source.js';
export { PatternAPIClient } from './pattern-api-client.js';

// Export types
export * from './types.js';

// Legacy exports for backward compatibility (will be removed in next major version)
export { SecurityDetectorV2 as SecurityDetector } from './detector-v2.js';