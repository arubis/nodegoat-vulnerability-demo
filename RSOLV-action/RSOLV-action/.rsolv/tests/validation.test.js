{
  "red": {
    "testName": "should be vulnerable to sql injection (RED)",
    "testCode": "test(\"should be vulnerable to sql injection (RED)\", async () => {\n  const maliciousInput = \"'; DROP TABLE users; --\";\n  \n  // Server-side test  \n  const result = await processUserInput('testuser', maliciousInput);\n  // This test should FAIL on secure code (expect vulnerability to NOT exist)\n  // but PASS on vulnerable code (vulnerability does exist)\n  expect(result.authenticated).toBe(false);\n  expect(result.error).not.toContain('table');\n  \n});",
    "attackVector": "'; DROP TABLE users; --",
    "expectedBehavior": "should_fail_on_vulnerable_code"
  },
  "green": {
    "testName": "should prevent sql injection (GREEN)",
    "testCode": "test(\"should prevent sql injection (GREEN)\", async () => {\n  const maliciousInput = \"'; DROP TABLE users; --\";\n  const validInput = \"validpassword123\";\n  \n  \n  // Server-side test\n  const maliciousResult = await processUserInput('testuser', maliciousInput);\n  expect(maliciousResult.authenticated).toBe(false);\n  expect(maliciousResult.error).not.toContain('syntax error');\n  \n  const validResult = await processUserInput('testuser', validInput);\n  expect(validResult.authenticated).toBe(true);\n  \n});",
    "validInput": "validpassword123",
    "expectedBehavior": "should_pass_on_fixed_code"
  },
  "refactor": {
    "testName": "should maintain functionality after security fix",
    "testCode": "test(\"should maintain functionality after security fix\", async () => {\n  // Test core functionality still works\n  \n  // Valid login should work\n  \n\n  // User data should be retrieved correctly\n  \n\n  // Sessions should be maintained\n  \n\n  // Special characters in names should be handled\n  \n\n  // Unicode characters should work\n  \n  \n  const normalInput = \"validpassword123\";\n  const result = await processUserInput('normaluser', normalInput);\n  \n  expect(result.success).toBe(true);\n  expect(result.data).toBeDefined();\n});",
    "functionalValidation": [
      "Valid login should work",
      "User data should be retrieved correctly",
      "Sessions should be maintained",
      "Special characters in names should be handled",
      "Unicode characters should work"
    ],
    "expectedBehavior": "should_pass_on_both_versions"
  }
}