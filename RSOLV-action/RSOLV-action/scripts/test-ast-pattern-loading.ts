#!/usr/bin/env bun
/**
 * Test loading AST-enhanced patterns from the API
 */

import { PatternAPIClient } from '../src/security/pattern-api-client.js';

async function testASTPatternLoading() {
  console.log('🧪 Testing AST Pattern Loading\n');
  
  const client = new PatternAPIClient({
    apiUrl: process.env.RSOLV_API_URL || 'https://api.rsolv.dev',
    apiKey: process.env.RSOLV_API_KEY
  });
  
  if (!process.env.RSOLV_API_KEY) {
    console.warn('⚠️  No RSOLV_API_KEY provided - testing with demo patterns only');
  }
  
  try {
    // Test standard format
    console.log('📥 Fetching standard format patterns...');
    const standardPatterns = await client.fetchPatterns('javascript');
    console.log(`✅ Loaded ${standardPatterns.length} standard patterns`);
    
    // Find a pattern with AST enhancements
    const sqlPattern = standardPatterns.find(p => p.id === 'js-sql-injection-concat');
    if (sqlPattern) {
      console.log(`\n📋 Standard format - SQL Injection Pattern:`);
      console.log(`- ID: ${sqlPattern.id}`);
      console.log(`- AST Rules: ${sqlPattern.astRules ? '✅ Present' : '❌ Missing'}`);
      console.log(`- Context Rules: ${sqlPattern.contextRules ? '✅ Present' : '❌ Missing'}`);
    }
    
    // Now test enhanced format by modifying the URL
    console.log('\n📥 Fetching enhanced format patterns...');
    const enhancedClient = new PatternAPIClient({
      apiUrl: `${process.env.RSOLV_API_URL || 'https://api.rsolv.dev'}/api/v1/patterns`,
      apiKey: process.env.RSOLV_API_KEY
    });
    
    // Temporarily override fetch to add format parameter
    const originalFetch = global.fetch;
    global.fetch = async (url: any, options: any) => {
      if (typeof url === 'string' && url.includes('/api/v1/patterns')) {
        const urlObj = new URL(url);
        urlObj.searchParams.set('format', 'enhanced');
        url = urlObj.toString();
        console.log(`🔗 Requesting: ${url}`);
      }
      return originalFetch(url, options);
    };
    
    const enhancedPatterns = await enhancedClient.fetchPatterns('javascript');
    global.fetch = originalFetch; // Restore
    
    console.log(`✅ Loaded ${enhancedPatterns.length} enhanced patterns`);
    
    // Check for AST enhancements
    const enhancedSqlPattern = enhancedPatterns.find(p => p.id === 'js-sql-injection-concat');
    if (enhancedSqlPattern) {
      console.log(`\n📋 Enhanced format - SQL Injection Pattern:`);
      console.log(`- ID: ${enhancedSqlPattern.id}`);
      console.log(`- AST Rules: ${enhancedSqlPattern.astRules ? '✅ Present' : '❌ Missing'}`);
      console.log(`- Context Rules: ${enhancedSqlPattern.contextRules ? '✅ Present' : '❌ Missing'}`);
      console.log(`- Confidence Rules: ${enhancedSqlPattern.confidenceRules ? '✅ Present' : '❌ Missing'}`);
      console.log(`- Min Confidence: ${enhancedSqlPattern.minConfidence !== undefined ? `✅ ${enhancedSqlPattern.minConfidence}` : '❌ Missing'}`);
      
      if (enhancedSqlPattern.astRules) {
        console.log('\n🔍 AST Rules Details:');
        console.log(JSON.stringify(enhancedSqlPattern.astRules, null, 2));
      }
    }
    
    // Summary
    console.log('\n📊 Summary:');
    const hasASTEnhancements = enhancedPatterns.some(p => p.astRules || p.contextRules);
    if (hasASTEnhancements) {
      console.log('✅ AST enhancements are being loaded from the API');
      const enhancedCount = enhancedPatterns.filter(p => p.astRules).length;
      console.log(`📈 ${enhancedCount} patterns have AST rules`);
    } else {
      console.log('❌ No AST enhancements found in the API response');
      console.log('ℹ️  This could mean:');
      console.log('   1. The API needs to be deployed with AST enhancement support');
      console.log('   2. The format=enhanced parameter is not working');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testASTPatternLoading();