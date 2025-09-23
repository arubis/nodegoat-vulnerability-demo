#!/usr/bin/env bun

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import { logger } from '../src/utils/logger.js';

const testCode = `
function handleContributionsUpdate(req, res, next) {
    // Insecure use of eval() to parse inputs
    const preTax = eval(req.body.preTax);
    const afterTax = eval(req.body.afterTax);
    const roth = eval(req.body.roth);
}
`;

async function testPatternDetection() {
  const detector = new SecurityDetectorV2();
  
  logger.info('Testing pattern detection on eval() code...');
  const result = await detector.detect(testCode, 'javascript', 'test.js');
  
  logger.info('Detection result:', JSON.stringify(result, null, 2));
  
  if (result && result.vulnerabilities && result.vulnerabilities.length > 0) {
    logger.info(`✅ Found ${result.vulnerabilities.length} vulnerabilities`);
    result.vulnerabilities.forEach(v => {
      logger.info(`  - ${v.type}: ${v.message} at line ${v.line}`);
    });
  } else {
    logger.error('❌ No vulnerabilities detected!');
  }
}

testPatternDetection().catch(console.error);