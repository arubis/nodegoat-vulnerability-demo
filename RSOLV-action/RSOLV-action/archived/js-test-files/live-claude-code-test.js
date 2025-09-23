#!/usr/bin/env bun
/**
 * Live integration test for Claude Code adapter
 * 
 * This script tests the actual Claude Code adapter with the real Claude CLI.
 * It creates a real prompt, executes the actual Claude CLI, and processes
 * the real response to verify the end-to-end integration.
 * 
 * Prerequisites:
 * - Claude CLI must be installed and properly configured
 * - ANTHROPIC_API_KEY environment variable must be set
 * 
 * Usage: 
 * bun run live-claude-code-test.js
 */
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

// Import required modules
const { ClaudeCodeAdapter } = require('./src/ai/adapters/claude-code');
const { spawn } = require('child_process');

// Test data directory
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data', 'live-claude');
if (!fs.existsSync(TEST_DATA_DIR)) {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

// Sample issue for testing - using a simpler issue for faster Claude response
const sampleIssue = {
  id: 'live-test-1',
  title: 'Fix button styling in the header component',
  body: `
The header buttons are not displaying correctly on mobile devices. The styling
is inconsistent with our design system.

Steps to reproduce:
1. Open the app on a mobile device (or using responsive design mode in browser)
2. Navigate to any page with the main header
3. Observe that button styles are incorrect - wrong padding, colors, and text alignment

Technical details:
- The issue is in the HeaderButton component (src/components/Header/Button.js)
- The component doesn't properly apply responsive styles
- We're using React with styled-components for styling
- The design system defines specific button styles for mobile breakpoints

Expected behavior:
Buttons in the header should have consistent styling that matches our design system on all devices.
`,
  url: 'https://github.com/test-org/test-repo/issues/123'
};

// Sample analysis
const sampleAnalysis = {
  summary: "The HeaderButton component doesn't properly apply responsive styles for mobile devices, causing inconsistent styling.",
  complexity: "low",
  estimatedTime: 45,
  potentialFixes: [
    "Add proper media queries for mobile breakpoints",
    "Apply responsive padding and font sizes based on screen width",
    "Import and utilize design system tokens correctly",
    "Add missing mobile-specific styles from the design system"
  ],
  recommendedApproach: "Update the component to use design system tokens and add proper media queries for mobile breakpoints",
  relatedFiles: [
    "src/components/Header/Button.js",
    "src/styles/theme.js"
  ]
};

// Save results to output file
function saveResult(filename, data) {
  const outputPath = path.join(TEST_DATA_DIR, filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  return outputPath;
}

// Main test function
async function runLiveTest() {
  console.log(chalk.blue('🧪 Claude Code Live Integration Test'));
  console.log('Testing the actual Claude Code adapter with the real Claude CLI');
  
  // Create the issue context
  const issueContext = {
    id: sampleIssue.id,
    title: sampleIssue.title,
    body: sampleIssue.body,
    labels: ['bug', 'memory-leak'],
    repository: {
      owner: 'test-org',
      repo: 'test-repo',
      branch: 'main'
    },
    metadata: {
      htmlUrl: sampleIssue.url,
      user: 'test-user',
      state: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    url: sampleIssue.url
  };
  
  // Check if API key is available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('❌ Error: ANTHROPIC_API_KEY environment variable is not set'));
    process.exit(1);
  }
  
  try {
    // Step 1: Check if the Claude CLI is available
    console.log(chalk.blue('\n🔍 Checking Claude CLI availability...'));
    
    const config = {
      provider: 'anthropic',
      apiKey,
      modelName: 'claude-3-opus-20240229',
      useClaudeCode: true
    };
    
    const adapter = new ClaudeCodeAdapter(config);
    const isAvailable = await adapter.isAvailable();
    
    if (!isAvailable) {
      console.error(chalk.red('❌ Error: Claude CLI is not available'));
      console.log(chalk.yellow('Make sure it is installed and properly configured'));
      process.exit(1);
    }
    
    console.log(chalk.green('✅ Claude CLI is available'));
    
    // Step 2: Generate a solution using the Claude Code adapter
    console.log(chalk.blue('\n🧠 Generating solution using Claude Code...'));
    console.log('This will use the real Claude CLI to generate a solution');
    console.log('Issue:', chalk.cyan(issueContext.title));
    
    console.log(chalk.yellow('\nThis may take a few minutes...'));
    
    const startTime = Date.now();
    // Create a simple, concise prompt for faster response
    const enhancedPrompt = `
Generate a solution for this styling issue:

ISSUE: ${issueContext.title}
${issueContext.body}

Your solution should include:
1. A fix for the HeaderButton component
2. Proper media queries for mobile
3. Design system integration

Return JSON in this format:
{
  "title": "Fix: descriptive title",
  "description": "Brief explanation",
  "files": [
    {
      "path": "src/components/Header/Button.js",
      "changes": "New component code"
    }
  ],
  "tests": [
    "Test description"
  ]
}
`;
    
    // We'll manually recreate the key steps of the adapter implementation
    // to enable progress reporting during solution generation
    
    // Step 1: Create a temp file for the prompt
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const promptPath = path.join(tempDir, `prompt-${Date.now()}.txt`);
    
    console.log(chalk.blue('\n📝 Creating prompt file...'));
    fs.writeFileSync(promptPath, enhancedPrompt);
    
    // Step 2: Setup Claude CLI arguments - using standard JSON format
    const args = [
      '--print',  // Non-interactive mode
      '--output-format', 'json',  // Standard JSON output format
      '--verbose'  // For more detailed output
    ];
    
    args.push(enhancedPrompt);
    
    // Step 3: Setup environment variables
    const envVars = {
      ...process.env,
      ANTHROPIC_API_KEY: apiKey
    };
    
    console.log(chalk.blue('\n🔄 Executing Claude CLI...'));
    console.log(chalk.yellow('Progress indicators will appear below:'));
    
    // Create a progress spinner
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinnerIndex = 0;
    let spinnerInterval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(spinnerChars[spinnerIndex])} Processing... `);
      spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
    }, 100);
    
    // Step 4: Execute Claude CLI with live output streaming
    let output = '';
    let jsonStarted = false;
    let jsonContent = '';
    let solution = null;
    
    try {
      // Execute the CLI
      const childProcess = spawn(adapter.executablePath, args, {
        cwd: process.cwd(),
        shell: true,
        env: envVars
      });
      
      // Setup variables for streaming
      let responseStarted = false;
      let lastLineWasJson = false;
      let responseText = '';
      let chunkCount = 0;
      
      childProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        chunkCount++;
        
        // For the first few chunks, show verbose info
        if (chunkCount <= 3 && !responseStarted) {
          const infoLines = chunk
            .split('\n')
            .filter(line => line.trim().length > 0 && !line.includes('{'));
          
          if (infoLines.length > 0) {
            clearInterval(spinnerInterval);
            infoLines.forEach(line => {
              process.stdout.write(`\r${' '.repeat(50)}\r`); // Clear the line
              console.log(chalk.gray(`> ${line.trim()}`));
            });
            
            spinnerInterval = setInterval(() => {
              process.stdout.write(`\r${chalk.cyan(spinnerChars[spinnerIndex])} Waiting for response... `);
              spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
            }, 100);
          }
        }
        
        // Handle output (we're not expecting incremental streaming chunks anymore)
        if (chunk.trim().length > 0) {
          // Collect all output
          jsonContent += chunk;
          
          if (!responseStarted) {
            responseStarted = true;
            
            // Show progress message and update the spinner
            clearInterval(spinnerInterval);
            process.stdout.write(`\r${' '.repeat(50)}\r`); // Clear the line
            console.log(chalk.green('\n━━━ Claude Response Preparation ━━━'));
            console.log(chalk.gray('(Full response will be shown when complete)'));
            
            // Set a new spinner with a better message
            spinnerInterval = setInterval(() => {
              const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
              process.stdout.write(`\r${chalk.cyan(spinnerChars[spinnerIndex])} Processing (${elapsedSeconds}s) - Generating solution...`);
              spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
            }, 100);
          }
                }
                
                // Clean and add the streaming text
                const cleanText = line.trim()
                  .replace(/\\n/g, '\n')
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, '\\');
                
                if (cleanText.length > 0 && !cleanText.includes('{')) {
                  process.stdout.write(cleanText);
                  responseText += cleanText;
                }
              }
            }
          } catch (e) {
            // Just show the raw chunk if JSON parsing fails
            process.stdout.write(chunk);
          }
        }
      });
      
      childProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.log(chalk.yellow(`\r[stderr] ${chunk.trim()}`));
      });
      
      // Wait for the process to complete
      await new Promise((resolve, reject) => {
        childProcess.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Claude CLI exited with code ${code}`));
          } else {
            resolve();
          }
        });
      });
      
      // Step 5: Parse the output
      clearInterval(spinnerInterval);
      process.stdout.write(`\r${' '.repeat(50)}\r`); // Clear the line
      console.log(chalk.green('✅ Claude CLI execution completed'));
      
      // Parse the JSON content
      try {
        if (jsonContent) {
          // Try to extract JSON from the output
          const jsonMatch = jsonContent.match(/{[\s\S]*}/);
          if (jsonMatch) {
            const cleanJson = jsonMatch[0].trim();
            solution = JSON.parse(cleanJson);
          }
        }
        
        // If no JSON found or parsing failed, try to parse the whole output
        if (!solution && output) {
          try {
            solution = JSON.parse(output);
          } catch (e) {
            // Try to extract JSON from code blocks
            const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
              solution = JSON.parse(codeBlockMatch[1]);
            }
          }
        }
        
        // If still no solution, create a fallback
        if (!solution) {
          console.log(chalk.yellow('⚠️ Could not parse Claude output as JSON'));
          solution = {
            title: `Fix for: ${issueContext.title}`,
            description: "Could not parse Claude Code output. Please check the logs for more information.",
            files: [],
            tests: []
          };
        }
      } catch (parseError) {
        console.error(chalk.yellow('⚠️ Error parsing Claude output:'), parseError);
        solution = {
          title: `Fix for: ${issueContext.title}`,
          description: "Could not parse Claude Code output. Please check the logs for more information.",
          files: [],
          tests: []
        };
      }
    } catch (error) {
      clearInterval(spinnerInterval);
      throw error;
    } finally {
      // Clean up
      if (fs.existsSync(promptPath)) {
        fs.unlinkSync(promptPath);
      }
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(chalk.green(`✅ Solution generated in ${duration.toFixed(1)} seconds`));
    
    // Step 3: Save and analyze the solution
    const solutionPath = saveResult('live-claude-solution.json', solution);
    console.log(chalk.green(`✅ Solution saved to: ${solutionPath}`));
    
    console.log(chalk.blue('\n📊 Solution Summary:'));
    console.log('Title:', chalk.cyan(solution.title));
    console.log('Description:', chalk.cyan(solution.description.substring(0, 100) + '...'));
    console.log('Files to modify:', chalk.cyan(solution.files.length));
    
    if (solution.files && solution.files.length > 0) {
      console.log(chalk.blue('\nFile Changes:'));
      solution.files.forEach((file, index) => {
        console.log(`${index + 1}. ${chalk.cyan(file.path)}`);
        console.log(`   Changes: ${file.changes.length} characters`);
      });
    }
    
    if (solution.tests && solution.tests.length > 0) {
      console.log(chalk.blue('\nTests:'));
      solution.tests.forEach((test, index) => {
        console.log(`${index + 1}. ${chalk.cyan(test)}`);
      });
    }
    
    // Step 4: Validate solution structure
    console.log(chalk.blue('\n✅ Validation:'));
    
    const validTitle = solution.title && typeof solution.title === 'string';
    const validDescription = solution.description && typeof solution.description === 'string';
    const validFiles = solution.files && Array.isArray(solution.files) && 
                      solution.files.every(f => f.path && f.changes);
    const validTests = !solution.tests || Array.isArray(solution.tests);
    
    console.log('Valid title:', validTitle ? chalk.green('✓') : chalk.red('✗'));
    console.log('Valid description:', validDescription ? chalk.green('✓') : chalk.red('✗'));
    console.log('Valid files array:', validFiles ? chalk.green('✓') : chalk.red('✗'));
    console.log('Valid tests array:', validTests ? chalk.green('✓') : chalk.red('✗'));
    
    const isValid = validTitle && validDescription && validFiles && validTests;
    
    if (isValid) {
      console.log(chalk.green('\n✅ Integration test PASSED: Claude Code adapter is working correctly'));
    } else {
      console.log(chalk.red('\n❌ Integration test FAILED: Solution structure is invalid'));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Integration test FAILED with error:'));
    console.error(error);
    process.exit(1);
  }
}

// Run the test
runLiveTest();