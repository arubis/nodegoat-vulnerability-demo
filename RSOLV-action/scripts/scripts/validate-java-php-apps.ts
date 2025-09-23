#!/usr/bin/env bun

/**
 * Phase 6C: Validate test generation with Java and PHP vulnerable applications
 */

import { TestGeneratingSecurityAnalyzer } from '../src/ai/test-generating-security-analyzer.js';
import { SecurityDetectorV2 } from '../src/security/detector-v2.js';
import type { IssueContext, ActionConfig } from '../src/types/index.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Mock vulnerable Java app structure
const mockJavaApp = {
  'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <groupId>com.example</groupId>
  <artifactId>vulnerable-app</artifactId>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`,
  
  'src/main/java/com/example/UserController.java': `
package com.example;

import org.springframework.web.bind.annotation.*;
import java.sql.*;

@RestController
@RequestMapping("/users")
public class UserController {
    
    @GetMapping("/{id}")
    public User getUser(@PathVariable String id) throws SQLException {
        // SQL Injection vulnerability
        String query = "SELECT * FROM users WHERE id = " + id;
        Connection conn = getConnection();
        Statement stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(query);
        
        if (rs.next()) {
            return new User(rs.getString("name"), rs.getString("email"));
        }
        return null;
    }
    
    @PostMapping("/search")
    public List<User> searchUsers(@RequestParam String name) throws SQLException {
        // Another SQL injection
        String query = "SELECT * FROM users WHERE name LIKE '%" + name + "%'";
        // ... execute query
    }
}`,

  'src/test/java/com/example/UserControllerTest.java': `
package com.example;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

@RunWith(SpringRunner.class)
@SpringBootTest
public class UserControllerTest {
    
    @Test
    public void testGetUser() {
        // Existing test
    }
}`
};

// Mock vulnerable PHP app structure
const mockPHPApp = {
  'composer.json': `{
  "name": "vulnerable/php-app",
  "require-dev": {
    "phpunit/phpunit": "^9.5"
  }
}`,
  
  'src/UserController.php': `<?php
namespace App\\Controllers;

class UserController {
    private $db;
    
    public function getUser($id) {
        // SQL Injection vulnerability
        $query = "SELECT * FROM users WHERE id = " . $id;
        $result = mysqli_query($this->db, $query);
        return mysqli_fetch_assoc($result);
    }
    
    public function searchUsers($name) {
        // XSS vulnerability
        echo "<h1>Search results for: " . $name . "</h1>";
        
        // SQL injection
        $query = "SELECT * FROM users WHERE name LIKE '%" . $name . "%'";
        $result = mysqli_query($this->db, $query);
        // ...
    }
}`,

  'tests/UserControllerTest.php': `<?php
use PHPUnit\\Framework\\TestCase;

class UserControllerTest extends TestCase {
    public function testGetUser() {
        // Existing test
    }
}`
};

async function validateJavaApp() {
  console.log('\n=== Phase 6C: Java App Validation ===\n');
  
  // Create mock issue
  const issue: IssueContext = {
    id: 'java-1',
    number: 1,
    title: 'SQL Injection in UserController',
    body: 'Found SQL injection vulnerability in UserController.java at line 14 where user input is concatenated directly into SQL query',
    labels: ['security', 'sql-injection'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'java-app',
      fullName: 'test/java-app',
      defaultBranch: 'main',
      language: 'java'
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const config: ActionConfig = {
    enableSecurityAnalysis: true,
    aiProvider: {
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      apiKey: 'test-key'
    }
  } as ActionConfig;
  
  // Convert mock files to Map
  const codebaseFiles = new Map(Object.entries(mockJavaApp));
  
  // Test detection
  const detector = new SecurityDetectorV2();
  const vulnerabilities: any[] = [];
  
  // Detect in each file
  for (const [filePath, content] of Array.from(codebaseFiles)) {
    if (filePath.endsWith('.java')) {
      const fileVulns = await detector.detect(content, 'java', filePath);
      vulnerabilities.push(...fileVulns);
    }
  }
  
  console.log('Detected vulnerabilities:', vulnerabilities.length);
  vulnerabilities.forEach(v => {
    console.log(`- ${v.type} in ${v.filePath}:${v.lineNumber}`);
  });
  
  // Test generation with mock AI client
  const mockAIClient = {
    async analyzeIssue(issue: any, config: any) {
      return {
        canBeFixed: true,
        files: issue.repository.language === 'java' 
          ? ['src/main/java/com/example/UserController.java']
          : ['src/UserController.php'],
        filesToModify: issue.repository.language === 'java'
          ? ['src/main/java/com/example/UserController.java']
          : ['src/UserController.php'],
        suggestedApproach: 'Use parameterized queries',
        complexity: 'medium' as const,
        estimatedTime: '15 minutes',
        summary: 'SQL injection vulnerability can be fixed',
        relatedFiles: issue.repository.language === 'java'
          ? ['src/main/java/com/example/UserController.java']
          : ['src/UserController.php']
      };
    }
  };
  
  const analyzer = new TestGeneratingSecurityAnalyzer(mockAIClient as any);
  const result = await analyzer.analyzeWithTestGeneration(issue, config, codebaseFiles);
  
  if (result.generatedTests?.success) {
    console.log('\n✅ Generated tests:', result.generatedTests.tests.length);
    result.generatedTests.tests.forEach(test => {
      console.log(`\nFramework: ${test.framework}`);
      console.log('Test code preview:');
      console.log(test.testCode.substring(0, 300) + '...');
    });
  } else {
    console.log('\n❌ Test generation failed');
  }
  
  return result;
}

async function validatePHPApp() {
  console.log('\n=== Phase 6C: PHP App Validation ===\n');
  
  // Create mock issue
  const issue: IssueContext = {
    id: 'php-1',
    number: 2,
    title: 'Multiple vulnerabilities in UserController',
    body: 'Found SQL injection and XSS vulnerabilities in UserController.php',
    labels: ['security', 'sql-injection', 'xss'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'php-app',
      fullName: 'test/php-app',
      defaultBranch: 'main',
      language: 'php'
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const config: ActionConfig = {
    enableSecurityAnalysis: true,
    aiProvider: {
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      apiKey: 'test-key'
    }
  } as ActionConfig;
  
  // Convert mock files to Map
  const codebaseFiles = new Map(Object.entries(mockPHPApp));
  
  // Test detection
  const detector = new SecurityDetectorV2();
  const vulnerabilities: any[] = [];
  
  // Detect in each file
  for (const [filePath, content] of Array.from(codebaseFiles)) {
    if (filePath.endsWith('.php')) {
      const fileVulns = await detector.detect(content, 'php', filePath);
      vulnerabilities.push(...fileVulns);
    }
  }
  
  console.log('Detected vulnerabilities:', vulnerabilities.length);
  vulnerabilities.forEach(v => {
    console.log(`- ${v.type} in ${v.filePath}:${v.lineNumber}`);
  });
  
  // Test generation with mock AI client
  const mockAIClient = {
    async analyzeIssue(issue: any, config: any) {
      return {
        canBeFixed: true,
        files: issue.repository.language === 'java' 
          ? ['src/main/java/com/example/UserController.java']
          : ['src/UserController.php'],
        filesToModify: issue.repository.language === 'java'
          ? ['src/main/java/com/example/UserController.java']
          : ['src/UserController.php'],
        suggestedApproach: 'Use parameterized queries',
        complexity: 'medium' as const,
        estimatedTime: '15 minutes',
        summary: 'SQL injection vulnerability can be fixed',
        relatedFiles: issue.repository.language === 'java'
          ? ['src/main/java/com/example/UserController.java']
          : ['src/UserController.php']
      };
    }
  };
  
  const analyzer = new TestGeneratingSecurityAnalyzer(mockAIClient as any);
  const result = await analyzer.analyzeWithTestGeneration(issue, config, codebaseFiles);
  
  if (result.generatedTests?.success) {
    console.log('\n✅ Generated tests:', result.generatedTests.tests.length);
    result.generatedTests.tests.forEach(test => {
      console.log(`\nFramework: ${test.framework}`);
      console.log('Test code preview:');
      console.log(test.testCode.substring(0, 300) + '...');
    });
  } else {
    console.log('\n❌ Test generation failed');
  }
  
  return result;
}

async function checkPatternSupport() {
  console.log('\n=== Checking Pattern Support ===\n');
  
  // Check if we have Java/PHP patterns
  const { getMinimalPatterns } = await import('../src/security/minimal-patterns.js');
  const patterns = getMinimalPatterns();
  
  const javaPatterns = patterns.filter(p => 
    p.languages?.includes('java') || p.id.toLowerCase().includes('java')
  );
  const phpPatterns = patterns.filter(p => 
    p.languages?.includes('php') || p.id.toLowerCase().includes('php')
  );
  
  console.log(`Java patterns: ${javaPatterns.length}`);
  console.log(`PHP patterns: ${phpPatterns.length}`);
  
  if (javaPatterns.length === 0) {
    console.log('\n⚠️  No Java-specific patterns found. Need to add:');
    console.log('- JDBC SQL injection patterns');
    console.log('- Spring SQL injection patterns');
    console.log('- Java serialization patterns');
  }
  
  if (phpPatterns.length === 0) {
    console.log('\n⚠️  No PHP-specific patterns found. Need to add:');
    console.log('- mysqli/PDO SQL injection patterns');
    console.log('- PHP XSS patterns');
    console.log('- PHP file inclusion patterns');
  }
}

// Run validation
async function main() {
  console.log('Starting Phase 6C: Java/PHP Validation\n');
  
  await checkPatternSupport();
  
  const javaResult = await validateJavaApp();
  const phpResult = await validatePHPApp();
  
  // Summary
  console.log('\n=== Validation Summary ===\n');
  console.log('Java app:');
  console.log(`- Can be fixed: ${javaResult.canBeFixed}`);
  console.log(`- Tests generated: ${javaResult.generatedTests?.success || false}`);
  
  console.log('\nPHP app:');
  console.log(`- Can be fixed: ${phpResult.canBeFixed}`);
  console.log(`- Tests generated: ${phpResult.generatedTests?.success || false}`);
  
  console.log('\n📋 Next steps:');
  console.log('1. Add Java/PHP vulnerability patterns to minimal-patterns.ts');
  console.log('2. Add JUnit 5 and TestNG templates to AdaptiveTestGenerator');
  console.log('3. Test with real WebGoat and DVWA applications');
  console.log('4. Validate fix iteration with Java/PHP tests');
}

main().catch(console.error);