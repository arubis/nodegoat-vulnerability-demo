#!/usr/bin/env bun

/**
 * Debug Detection Issue - Test why patterns aren't detecting vulnerabilities
 */

import { SecurityDetectorV2 } from '../src/security/detector-v2.js';

// Configure API access
process.env.RSOLV_API_URL = 'http://localhost:4001';
process.env.RSOLV_API_KEY = 'rsolv_test_full_access_no_quota_2025';

async function testDetection() {
  console.log('🔍 Testing pattern detection on real vulnerable code...\n');
  
  const detector = new SecurityDetectorV2();
  
  // Test PHP SQL injection from DVWA
  console.log('📋 Testing PHP SQL injection (DVWA style):');
  const phpCode = `<?php
if( isset( $_REQUEST[ 'Submit' ] ) ) {
  $id = $_REQUEST[ 'id' ];
  $query  = "SELECT first_name, last_name FROM users WHERE user_id = '$id';";
  $result = mysqli_query($GLOBALS["___mysqli_ston"],  $query );
}
?>`;
  
  console.log('Code:');
  console.log(phpCode);
  console.log();
  
  const phpResults = await detector.detect(phpCode, 'php', 'test.php');
  console.log(`Found ${phpResults.length} vulnerabilities`);
  phpResults.forEach(vuln => {
    console.log(`- ${vuln.type} at line ${vuln.line}: ${vuln.pattern.name}`);
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test Java SQL injection from WebGoat
  console.log('📋 Testing Java SQL injection (WebGoat style):');
  const javaCode = `public class Test {
  protected AttackResult injectableQueryAvailability(String action) {
    String query = "SELECT * FROM access_log WHERE action LIKE '%" + action + "%'";
    ResultSet results = statement.executeQuery(query);
    return null;
  }
}`;
  
  console.log('Code:');
  console.log(javaCode);
  console.log();
  
  const javaResults = await detector.detect(javaCode, 'java', 'Test.java');
  console.log(`Found ${javaResults.length} vulnerabilities`);
  javaResults.forEach(vuln => {
    console.log(`- ${vuln.type} at line ${vuln.line}: ${vuln.pattern.name}`);
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test simpler PHP concatenation
  console.log('📋 Testing simpler PHP SQL injection (direct concatenation):');
  const phpSimple = `<?php
$query = "SELECT * FROM users WHERE id = " . $_GET['id'];
mysqli_query($conn, $query);
?>`;
  
  console.log('Code:');
  console.log(phpSimple);
  console.log();
  
  const phpSimpleResults = await detector.detect(phpSimple, 'php', 'test2.php');
  console.log(`Found ${phpSimpleResults.length} vulnerabilities`);
  phpSimpleResults.forEach(vuln => {
    console.log(`- ${vuln.type} at line ${vuln.line}: ${vuln.pattern.name}`);
  });
}

testDetection().catch(console.error);