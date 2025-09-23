#!/usr/bin/env ts-node

import { VendorDetector } from './src/vendor/vendor-detector.js';

async function testVendorDetection() {
  const detector = new VendorDetector();

  const testPaths = [
    'app/assets/vendor/chart/morris-0.4.3.min.js',
    'app/assets/vendor/jquery.min.js',
    'vendor/morris-0.4.3.min.js',
    'node_modules/morris/morris.min.js',
    'app/assets/scripts/main.js',
    'app/routes/index.js'
  ];

  console.log('Testing vendor detection:\n');

  for (const path of testPaths) {
    const isVendor = await detector.isVendorFile(path);
    const library = await detector.identifyLibrary(path);
    console.log(`Path: ${path}`);
    console.log(`  Is vendor: ${isVendor}`);
    if (library) {
      console.log(`  Library: ${library.name} v${library.version}`);
    }
    console.log();
  }
}

testVendorDetection().catch(console.error);