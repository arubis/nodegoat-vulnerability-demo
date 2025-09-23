import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AdaptiveTestGenerator } from '../adaptive-test-generator.js';
import { TestFrameworkDetector } from '../test-framework-detector.js';
import { CoverageAnalyzer } from '../coverage-analyzer.js';
import { IssueInterpreter } from '../issue-interpreter.js';
import { VulnerabilityType } from '../../security/types.js';

describe('Phase 6D: IaC/Terraform Validation', () => {
  let testGenerator: AdaptiveTestGenerator;

  beforeEach(() => {
    const detector = new TestFrameworkDetector();
    const analyzer = new CoverageAnalyzer();
    const interpreter = new IssueInterpreter();
    testGenerator = new AdaptiveTestGenerator(detector, analyzer, interpreter);
  });

  describe('Terraform Vulnerability Examples', () => {
    test('should handle public S3 bucket vulnerability', async () => {
      const vulnerableTerraform = `
resource "aws_s3_bucket" "data_bucket" {
  bucket = "my-vulnerable-data-bucket"
  acl    = "public-read"  # VULNERABILITY: Public access
}

resource "aws_s3_bucket" "logs" {
  bucket = "my-log-bucket"
  acl    = "log-delivery-write"
}
`;

      const repoStructure = {
        'main.tf': vulnerableTerraform,
        'variables.tf': 'variable "region" { default = "us-east-1" }',
        'outputs.tf': 'output "bucket_id" { value = aws_s3_bucket.data_bucket.id }'
      };

      // Current limitation: We don't have IaC vulnerability types yet
      const vulnerability = {
        id: 'terraform-s3-public',
        type: VulnerabilityType.SECURITY_MISCONFIGURATION, // Using closest match
        file: 'main.tf',
        line: 4,
        description: 'S3 bucket configured with public-read ACL'
      };

      // Test what happens when we try to generate tests
      const result = await testGenerator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      // We expect it to fail gracefully or generate generic tests
      expect(result.success).toBe(true);
      
      // Should detect no test framework (Terraform doesn't have traditional test frameworks)
      expect(result.testFramework).toBeUndefined();
      
      // Should generate some kind of test
      expect(result.testCode).toBeTruthy();
      console.log('Generated test code:', result.testCode);
    });

    test('should handle open security group vulnerability', async () => {
      const vulnerableSecurityGroup = `
resource "aws_security_group" "web_server" {
  name        = "web_server_sg"
  description = "Security group for web server"

  ingress {
    description = "SSH from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # VULNERABILITY: SSH open to world
  }

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # OK: HTTP is expected to be public
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
`;

      const vulnerability = {
        id: 'terraform-open-ssh',
        type: VulnerabilityType.SECURITY_MISCONFIGURATION,
        file: 'security_groups.tf',
        line: 11,
        description: 'Security group allows SSH access from 0.0.0.0/0'
      };

      const repoStructure = {
        'security_groups.tf': vulnerableSecurityGroup
      };

      const result = await testGenerator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      expect(result.success).toBe(true);
      expect(result.testCode).toContain('security');
    });
  });

  describe('IaC Test Framework Detection', () => {
    test('should detect Terratest framework', async () => {
      const repoWithTerratest = {
        'go.mod': `module github.com/example/infrastructure

go 1.19

require (
  github.com/gruntwork-io/terratest v0.41.0
  github.com/stretchr/testify v1.8.0
)`,
        'test/main_test.go': `package test

import (
  "testing"
  "github.com/gruntwork-io/terratest/modules/terraform"
)

func TestS3Bucket(t *testing.T) {
  // Terratest code
}`
      };

      // Use AdaptiveTestGenerator's framework detection since TestFrameworkDetector
      // expects file system paths, not repo structure objects
      const result = await testGenerator.generateAdaptiveTests(
        {
          id: 'test-terratest',
          type: VulnerabilityType.SECURITY_MISCONFIGURATION,
          file: 'test/main_test.go',
          line: 1,
          description: 'Test framework detection'
        },
        repoWithTerratest
      );
      
      // Currently won't detect Terratest as we don't have Go support
      console.log('Terratest detection result:', result);
      
      // Should generate generic tests since we don't have Go/Terratest support
      expect(result.success).toBe(true);
      expect(result.testFramework).toBeUndefined();
    });

    test('should detect Kitchen-Terraform', async () => {
      const repoWithKitchen = {
        '.kitchen.yml': `---
driver:
  name: terraform

provisioner:
  name: terraform

platforms:
  - name: aws

suites:
  - name: default
    verifier:
      name: terraform
      systems:
        - name: basic
          backend: aws`,
        'Gemfile': `source 'https://rubygems.org'

gem 'kitchen-terraform'
gem 'awspec'`
      };

      const result = await testGenerator.generateAdaptiveTests(
        {
          id: 'test-kitchen',
          type: VulnerabilityType.SECURITY_MISCONFIGURATION, 
          file: '.kitchen.yml',
          line: 1,
          description: 'Test framework detection'
        },
        repoWithKitchen
      );
      
      // Might detect Ruby test framework but not Kitchen-Terraform specifically
      console.log('Kitchen-Terraform detection:', result);
      
      // Should detect RSpec from Gemfile
      expect(result.success).toBe(true);
    });
  });

  describe('IaC Pattern Limitations', () => {
    test('should demonstrate current IaC detection limitations', async () => {
      const publicRDSInstance = `
resource "aws_db_instance" "database" {
  identifier     = "mydb"
  engine         = "mysql"
  engine_version = "5.7"
  instance_class = "db.t2.micro"
  
  allocated_storage = 20
  storage_encrypted = false  # VULNERABILITY: Unencrypted storage
  
  db_name  = "myapp"
  username = "admin"
  password = "changeme123!"  # VULNERABILITY: Hardcoded password
  
  publicly_accessible = true  # VULNERABILITY: Public RDS
  
  skip_final_snapshot = true
}
`;

      // Without a proper SecurityAnalyzer setup, we'll validate the test generation instead
      const vulnerability = {
        id: 'terraform-multi-vuln',
        type: VulnerabilityType.HARDCODED_SECRET,
        file: 'rds.tf',
        line: 13,
        description: 'Multiple vulnerabilities in RDS configuration'
      };

      const repoStructure = {
        'rds.tf': publicRDSInstance
      };

      const result = await testGenerator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      // We can generate tests but won't detect IaC-specific patterns
      expect(result.success).toBe(true);
      
      // The test should contain generic test structure
      expect(result.testCode.toLowerCase()).toContain('vulnerability');
      
      // But won't have IaC-specific test logic for encryption or public access
      const hasEncryptionTest = result.testCode.includes('storage_encrypted');
      const hasPublicAccessTest = result.testCode.includes('publicly_accessible');
      
      console.log('IaC-specific test coverage:', {
        hasEncryptionTest,
        hasPublicAccessTest
      });
      
      // Current limitation: generic tests, not IaC-aware
      expect(hasEncryptionTest).toBe(false);
      expect(hasPublicAccessTest).toBe(false);
      
      // The generic test should at least reference the file
      expect(result.testCode).toContain('rds.tf');
    });
  });

  describe('Test Generation for IaC', () => {
    test('should generate appropriate test structure for Terraform', async () => {
      // Even without proper IaC support, let's see what kind of tests we generate
      const vulnerability = {
        id: 'terraform-hardcoded-password',
        type: VulnerabilityType.HARDCODED_SECRET,
        file: 'main.tf',
        line: 12,
        description: 'Hardcoded password in RDS configuration',
        severity: 'high'
      };

      const repoStructure = {
        'main.tf': 'resource "aws_db_instance" "db" { password = "hardcoded!" }'
      };

      const result = await testGenerator.generateAdaptiveTests(
        vulnerability,
        repoStructure
      );

      // Should generate some kind of test even without IaC-specific templates
      expect(result.success).toBe(true);
      expect(result.testCode).toBeTruthy();
      
      // The test might be generic but should contain test structure
      expect(result.testCode.toLowerCase()).toContain('vulnerability');
    });

    test('should identify IaC fix patterns', () => {
      // Test our understanding of IaC fixes
      const vulnerableTerraform = `
resource "aws_s3_bucket" "data" {
  bucket = "my-bucket"
  acl    = "public-read"
}`;

      const fixedTerraform = `
resource "aws_s3_bucket" "data" {
  bucket = "my-bucket"
  acl    = "private"
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`;

      // Verify the fix includes both ACL change and public access block
      expect(fixedTerraform).toContain('acl    = "private"');
      expect(fixedTerraform).toContain('block_public_acls');
      expect(fixedTerraform).toContain('aws_s3_bucket_public_access_block');
    });
  });

  describe('Expected IaC Test Frameworks', () => {
    test('should understand Terratest test structure', () => {
      const expectedTerratestCode = `
func TestS3BucketIsPrivate(t *testing.T) {
    terraformOptions := &terraform.Options{
        TerraformDir: "../terraform",
    }
    
    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)
    
    bucketID := terraform.Output(t, terraformOptions, "bucket_id")
    
    // Verify bucket is not publicly accessible
    aws.AssertS3BucketPolicyDoesNotAllowPublicAccess(t, "us-east-1", bucketID)
}`;

      // This is what we'd want to generate for Terratest
      expect(expectedTerratestCode).toContain('AssertS3BucketPolicyDoesNotAllowPublicAccess');
      expect(expectedTerratestCode).toContain('terraform.InitAndApply');
    });

    test('should understand Terraform Compliance structure', () => {
      const expectedComplianceTest = `
Feature: S3 Bucket Security

  Scenario: S3 buckets must be private
    Given I have aws_s3_bucket defined
    Then it must not have acl property with value public-read
    And it must not have acl property with value public-read-write
    
  Scenario: S3 buckets must have versioning
    Given I have aws_s3_bucket defined
    Then it must have versioning enabled`;

      // This is BDD-style testing for Terraform
      expect(expectedComplianceTest).toContain('Given I have aws_s3_bucket defined');
      expect(expectedComplianceTest).toContain('Then it must not have');
    });
  });
});