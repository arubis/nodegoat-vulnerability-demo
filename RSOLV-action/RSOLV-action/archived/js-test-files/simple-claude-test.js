#!/usr/bin/env bun
/**
 * Simple test for Claude CLI integration
 * Tests basic functionality with a very short prompt
 */
const { execSync } = require('child_process');
const chalk = require('chalk');

console.log(chalk.blue('🔍 Basic Claude CLI Test'));
console.log(chalk.gray('This test verifies basic functionality with a very short prompt'));

// Simple prompt that should return quickly
const prompt = "What's 2+2? Answer with just the number.";

try {
  console.log(chalk.yellow('Executing Claude CLI with simple prompt...'));
  
  // Use execSync for simplicity in this basic test
  const output = execSync(`claude --print "${prompt}"`, {
    timeout: 10000, // 10 second timeout
    encoding: 'utf8'
  });
  
  console.log(chalk.green('\n✅ Claude CLI responded successfully!'));
  console.log(chalk.blue('Response:'));
  console.log(chalk.cyan(output.trim()));
  
  if (output.trim() === '4') {
    console.log(chalk.green('\n✅ Basic functionality verified - Claude responded with correct answer'));
  } else {
    console.log(chalk.yellow('\n⚠️ Claude responded but with unexpected output (expected "4")'));
  }
} catch (error) {
  console.error(chalk.red('\n❌ Error executing Claude CLI:'));
  console.error(chalk.red(error.message));
  
  if (error.code === 'ETIMEDOUT') {
    console.log(chalk.yellow('\nEven simple prompts are timing out, suggesting a potential configuration issue.'));
  }
}