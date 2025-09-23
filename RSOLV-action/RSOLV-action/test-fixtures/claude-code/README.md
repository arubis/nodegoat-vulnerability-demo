# Claude Code Context Quality Evaluation

This directory contains test fixtures for evaluating the quality of Claude Code's context-gathering capabilities compared to the standard approach.

## Overview

The test fixtures consist of:

1. A sample repository (`sample-repo/`) with intentional bugs and enhancement opportunities
2. Test cases (`test-cases.json`) that define issues to be solved
3. A test harness (`context-evaluation.js`) that runs the same issues through both approaches and compares results

## Sample Repository

The sample repository is a simple Node.js/Express application with a MongoDB database. It includes:

- User and product models
- RESTful API routes
- Logging system
- Several intentionally introduced bugs and areas for enhancement

## Test Cases

Each test case represents an issue that needs to be solved, such as:

1. Fixing the timestamp format in the logger
2. Correcting model references
3. Adding pagination to endpoints
4. Implementing validation
5. Preventing duplicate registration

Each test case includes:
- Issue title and description
- Expected files that should be included in context
- Expected dependencies that should be recognized
- Specific code patterns that should be found
- Expected context depth for standard vs. Claude Code approaches

## Running the Evaluation

To run the evaluation:

```bash
# Set your Anthropic API key (if not already set)
export ANTHROPIC_API_KEY=your_api_key_here

# Run the evaluation
cd /home/dylan/dev/rsolv/RSOLV-action
bun run test-fixtures/claude-code/context-evaluation.js
```

The evaluation will:

1. Run each test case through both the standard and Claude Code approaches
2. Track which files and code patterns were referenced in the solutions
3. Calculate an accuracy score based on expected context
4. Measure performance metrics like time taken
5. Save detailed results to `evaluation-results.json`

## Understanding the Results

The evaluation produces both detailed and summary results:

### Detailed Results

For each test case, the detailed results include:
- The standard approach solution and accuracy
- The Claude Code approach solution and accuracy
- Time taken for each approach
- Files referenced in each solution

### Summary Metrics

The summary includes:
- Average accuracy for standard approach
- Average accuracy for Claude Code approach
- Overall improvement percentage
- Number of valid test results

## Using for Benchmarking

These fixtures can be used to:

1. Benchmark future improvements to the Claude Code integration
2. Demonstrate the value of Claude Code's context-gathering to customers
3. Test against different issue types to identify strengths and weaknesses
4. Compare performance with different configuration settings

## Adding New Test Cases

To add new test cases:

1. Add appropriate files to the sample repository
2. Create a new entry in `test-cases.json` with appropriate expectations
3. Run the evaluation to see how both approaches handle the new case

## Example Output

```
===== EVALUATION SUMMARY =====
Total test cases: 5
Average standard accuracy: 65.2%
Average Claude Code accuracy: 92.8%
Improvement: 42.3%

Results saved to: /home/dylan/dev/rsolv/RSOLV-action/test-fixtures/claude-code/evaluation-results.json
```