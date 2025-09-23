# Claude Code Test Fixtures Guide

## Overview

This document provides a guide to the test fixtures we've created for evaluating Claude Code's context-gathering capabilities compared to our standard approach. These fixtures enable both automated testing and visual demonstrations of Claude Code's benefits.

## Components Created

1. **Sample Repository (`/test-fixtures/claude-code/sample-repo/`):**
   - A small Node.js/Express API with MongoDB models
   - Contains intentional bugs and enhancement opportunities
   - Structured with common patterns found in real repositories
   - Includes components like models, routes, logging, and database connections

2. **Test Cases (`/test-fixtures/claude-code/test-cases.json`):**
   - Five diverse test cases covering bugs and enhancements
   - Each case includes expected context files and references
   - Ratings for expected context depth and solution quality
   - Metadata for automated evaluation

3. **Evaluation Harness (`/test-fixtures/claude-code/context-evaluation.js`):**
   - Runs test cases through both standard and Claude Code approaches
   - Tracks referenced files and code patterns in solutions
   - Calculates accuracy scores based on expected context
   - Generates detailed comparison reports

4. **Documentation Files:**
   - `CLAUDE-CODE-TESTING.md`: Comprehensive testing guide
   - `/test-fixtures/claude-code/README.md`: Fixture-specific documentation
   - Test results are saved to `/test-fixtures/claude-code/evaluation-results.json`

## Usage Instructions

### Running Context Evaluation

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_api_key_here

# Run the evaluation
cd /home/dylan/dev/rsolv/RSOLV-action
bun run test-fixtures/claude-code/context-evaluation.js
```

The evaluation will:
1. Run each test case through both the standard and Claude Code approaches
2. Generate solutions for each approach
3. Compare how many expected files and references are found
4. Calculate accuracy scores
5. Save detailed results to `evaluation-results.json`

### Reviewing Results

The results show:
- Which files were referenced in each solution
- Which expected patterns were found
- Accuracy scores as percentages
- Time taken for each approach
- Overall improvement percentage

## Benefits

These fixtures provide several benefits:

1. **Quantitative Demonstration:**
   - Shows measurable improvement from Claude Code
   - Provides concrete metrics for marketing materials
   - Enables visualizing context depth differences

2. **Regression Testing:**
   - Ensures Claude Code integration continues to work
   - Catches issues with future adapter updates
   - Verifies context quality remains high

3. **Visual Demonstration:**
   - Can be used in sales demos and presentations
   - Shows exactly how improved context leads to better solutions
   - Provides clear before/after comparisons

4. **Use in Documentation:**
   - Examples for training materials
   - Real-world illustration of hybrid approach benefits
   - Technical case studies for Claude Code integration

## Example Test Cases

The test fixtures include the following cases:

1. **Timestamp Format Bug:**
   - Fix incorrect date format in logging system
   - Tests ability to find isolated bugs in utility files

2. **Model Reference Bug:**
   - Fix incorrect reference to User model in Product schema
   - Tests ability to correlate errors across multiple files

3. **Pagination Enhancement:**
   - Add pagination to product listing endpoint
   - Tests ability to understand performance implications

4. **Email Validation Enhancement:**
   - Add proper email validation for user creation
   - Tests ability to understand validation patterns

5. **Duplicate Registration Bug:**
   - Prevent creation of users with duplicate emails
   - Tests ability to understand model constraints and route logic

## Next Steps

1. **Integration with Demo Environment:**
   - Update demo environment to showcase context evaluation
   - Add visual representation of context gathering process
   - Implement side-by-side comparison view

2. **Additional Test Cases:**
   - Add more complex scenarios requiring deeper context
   - Include cases with security implications
   - Add cases requiring understanding of external dependencies

3. **Benchmarking Framework:**
   - Create automated benchmarking for different Claude Code versions
   - Track context improvements over time
   - Compare performance across different repository sizes

4. **Documentation Updates:**
   - Create visual guides showing context differences
   - Add evaluation results to technical documentation
   - Create marketing materials using evaluation data