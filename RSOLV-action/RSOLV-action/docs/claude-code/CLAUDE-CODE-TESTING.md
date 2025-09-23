# Claude Code Integration Testing Guide

This document provides guidelines for testing the Claude Code integration in the RSOLV system, including evaluation of context quality and benchmarking solution improvements.

## Overview

The Claude Code integration provides enhanced context-gathering capabilities through the Claude Code CLI. Our integration uses a hybrid approach that preserves our unique feedback loop system while leveraging Claude Code's sophisticated context-gathering.

## Test Components

1. **Unit Tests**: Test the Claude Code adapter implementation
2. **Integration Tests**: Test the adapter with the main AI solution pipeline
3. **Context Quality Evaluation**: Compare context-gathering with and without Claude Code
4. **End-to-End Tests**: Test complete workflow with Claude Code

## Running Unit and Integration Tests

To run the unit tests:

```bash
# Run Claude Code adapter unit tests
bun test src/ai/adapters/__tests__/claude-code.test.ts

# Run Claude Code integration tests
bun test src/ai/__tests__/claude-code.test.ts
bun test src/ai/__tests__/claude-code-integration.test.ts
```

## Context Quality Evaluation

We've created test fixtures that evaluate the quality of context-gathering with and without Claude Code. This helps demonstrate the value of Claude Code's context-gathering capabilities.

### Setup

The test fixtures are located in `/home/dylan/dev/rsolv/RSOLV-action/test-fixtures/claude-code/`:

- A sample repository with intentional bugs and enhancement opportunities
- Test cases that define issues to be solved
- A test harness that runs comparisons between standard and Claude Code approaches

### Running Context Evaluation

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_api_key_here

# Run the evaluation
cd /home/dylan/dev/rsolv/RSOLV-action
bun run test-fixtures/claude-code/context-evaluation.js
```

This will generate a report in `test-fixtures/claude-code/evaluation-results.json` showing:
- Which files were referenced in each solution
- Accuracy based on expected context
- Performance metrics

### Example Output

```
===== EVALUATION SUMMARY =====
Total test cases: 5
Average standard accuracy: 65.2%
Average Claude Code accuracy: 92.8%
Improvement: 42.3%

Results saved to: /home/dylan/dev/rsolv/RSOLV-action/test-fixtures/claude-code/evaluation-results.json
```

## Live Testing with Claude Code CLI

For testing with the actual Claude Code CLI:

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_api_key_here

# Run the demo with Claude Code
cd /home/dylan/dev/rsolv/RSOLV-action
bun run demo-env
```

When prompted, select 'claude-code' as the provider. The demo will check if Claude Code CLI is available and:
- If available: Use the actual Claude Code CLI
- If not available: Simulate Claude Code context-gathering

## Troubleshooting Test Issues

### Common Test Failures

1. **Timeout Errors**: Tests that interact with the Claude Code CLI may timeout if the mock isn't properly implemented.

   Fix: Ensure the mocked `spawn` function correctly handles process events and callbacks.

2. **Missing API Key**: Context evaluation requires an Anthropic API key.

   Fix: Set the `ANTHROPIC_API_KEY` environment variable.

3. **Context Parsing Issues**: If the Claude Code output format changes, parsing may fail.

   Fix: Update the parsing logic in `ClaudeCodeAdapter.parseSolution()`.

## Adding New Test Cases

To add new test cases to the context evaluation:

1. Add appropriate files to the sample repository in `test-fixtures/claude-code/sample-repo/`
2. Add a new entry to `test-fixtures/claude-code/test-cases.json`
3. Run the evaluation to see how both approaches handle the new case

## Benchmarking

You can use the context evaluation fixtures for benchmarking:

- Compare Claude Code versions
- Test different configuration settings
- Benchmark after making changes to the adapter

Save benchmark results in `test-fixtures/claude-code/benchmarks/` for tracking improvements over time.

## Demo Environment Testing

The demo environment supports testing Claude Code integration:

1. Use the interactive CLI (`bun run demo-env`)
2. Select 'claude-code' as the provider
3. Create or select an issue to analyze
4. The demo will show the context-gathering process and solution generation

This allows for manually testing the context-gathering capabilities and comparing solutions.

## Contribution Guidelines

When contributing to the Claude Code integration:

1. Add tests for new functionality
2. Run the context evaluation to ensure context quality doesn't regress
3. Update documentation if the adapter interface changes
4. Consider the hybrid nature of our approach - we want both Claude Code's context-gathering and our feedback system