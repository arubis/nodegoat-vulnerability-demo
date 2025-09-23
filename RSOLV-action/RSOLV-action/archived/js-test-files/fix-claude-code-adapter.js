#!/usr/bin/env bun
/**
 * Update the ClaudeCodeAdapter to use the standard output format
 * instead of attempting to stream the response
 */
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.blue('🔧 Fixing Claude Code Adapter'));

// Path to the adapter file
const adapterPath = path.join(process.cwd(), 'src', 'ai', 'adapters', 'claude-code.ts');

// Check if file exists
if (!fs.existsSync(adapterPath)) {
  console.error(chalk.red(`❌ File not found: ${adapterPath}`));
  process.exit(1);
}

// Read the current content
const currentContent = fs.readFileSync(adapterPath, 'utf8');

// Check if the file contains streaming settings
if (currentContent.includes('stream-json')) {
  console.log(chalk.yellow('Found streaming settings in adapter. Updating...'));
  
  // Replace streaming settings with standard output format
  const updatedContent = currentContent.replace(
    /--output-format[,\s]+['"]stream-json['"]/, 
    `--output-format json`
  );
  
  // Write updated file
  fs.writeFileSync(adapterPath, updatedContent, 'utf8');
  console.log(chalk.green('✅ Updated adapter to use standard JSON output format'));
  
  // Also update the live test file to use standard output
  const liveTestPath = path.join(process.cwd(), 'live-claude-code-test.js');
  if (fs.existsSync(liveTestPath)) {
    console.log(chalk.yellow('Updating live test file...'));
    const testContent = fs.readFileSync(liveTestPath, 'utf8');
    
    if (testContent.includes('stream-json')) {
      const updatedTestContent = testContent.replace(
        /--output-format[,\s]+['"]stream-json['"]/, 
        `--output-format json`
      );
      
      fs.writeFileSync(liveTestPath, updatedTestContent, 'utf8');
      console.log(chalk.green('✅ Updated live test to use standard JSON output format'));
    } else {
      console.log(chalk.gray('Live test file already using correct format'));
    }
  }
  
  // Create a README note about streaming
  const readmePath = path.join(process.cwd(), 'README-claude-code.md');
  const readmeContent = `# Claude Code Integration Notes

## Streaming Output

The current version of the Claude CLI (${chalk.bold('0.2.92')}) does not appear to support true streaming 
output in the way we initially expected. We attempted the following approaches:

1. Using \`--output-format stream-json\` - This didn't stream responses in real-time
2. Using \`--stream\` flag - This flag is not supported in the current version

### Current Approach

We've modified the adapter to use standard JSON output format instead:
\`\`\`javascript
const args = [
  '--print',
  '--output-format', 'json',  // Standard JSON output
  '--verbose'
];
\`\`\`

This ensures compatibility with the current Claude CLI while still providing 
a progress indicator through our spinner animation.

### Future Improvements

When true streaming support becomes available in the Claude CLI, we can revisit this implementation.
Meanwhile, our current approach provides a good user experience with the progress spinner and complete output parsing.
`;

  fs.writeFileSync(readmePath, readmeContent, 'utf8');
  console.log(chalk.green(`✅ Created README note at: ${readmePath}`));
  
} else {
  console.log(chalk.gray('Adapter already using the correct settings'));
}

console.log(chalk.green('\n✅ All fixes applied successfully'));