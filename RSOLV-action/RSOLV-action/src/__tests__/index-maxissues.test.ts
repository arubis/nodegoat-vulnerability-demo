import { describe, expect, test, vi } from 'vitest';
import { IssueContext } from '../types/index.js';

// Test the issue limiting logic directly
describe('Issue Limiting Logic', () => {
  test('should slice issues array when maxIssues is set', () => {
    const issues = createMockIssues(5);
    const maxIssues = 2;
    
    // This is the actual logic from index.ts
    const limitedIssues = maxIssues && maxIssues > 0 && issues.length > maxIssues
      ? issues.slice(0, maxIssues)
      : issues;
    
    expect(limitedIssues).toHaveLength(2);
    expect(limitedIssues[0].number).toBe(1);
    expect(limitedIssues[1].number).toBe(2);
  });

  test('should return all issues when maxIssues is not set', () => {
    const issues = createMockIssues(5);
    const maxIssues = undefined;
    
    const limitedIssues = maxIssues && maxIssues > 0 && issues.length > maxIssues
      ? issues.slice(0, maxIssues)
      : issues;
    
    expect(limitedIssues).toHaveLength(5);
  });

  test('should return all issues when maxIssues is 0', () => {
    const issues = createMockIssues(5);
    const maxIssues = 0;
    
    const limitedIssues = maxIssues && maxIssues > 0 && issues.length > maxIssues
      ? issues.slice(0, maxIssues)
      : issues;
    
    expect(limitedIssues).toHaveLength(5);
  });

  test('should return all issues when maxIssues is greater than issue count', () => {
    const issues = createMockIssues(3);
    const maxIssues = 10;
    
    const limitedIssues = maxIssues && maxIssues > 0 && issues.length > maxIssues
      ? issues.slice(0, maxIssues)
      : issues;
    
    expect(limitedIssues).toHaveLength(3);
  });

  test('should handle single issue limit', () => {
    const issues = createMockIssues(10);
    const maxIssues = 1;
    
    const limitedIssues = maxIssues && maxIssues > 0 && issues.length > maxIssues
      ? issues.slice(0, maxIssues)
      : issues;
    
    expect(limitedIssues).toHaveLength(1);
    expect(limitedIssues[0].number).toBe(1);
  });

  test('should handle exact match of maxIssues and issue count', () => {
    const issues = createMockIssues(3);
    const maxIssues = 3;
    
    const limitedIssues = maxIssues && maxIssues > 0 && issues.length > maxIssues
      ? issues.slice(0, maxIssues)
      : issues;
    
    expect(limitedIssues).toHaveLength(3);
  });
});

function createMockIssues(count: number): IssueContext[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `issue-${i + 1}`,
    number: i + 1,
    title: `Test Issue ${i + 1}`,
    body: `This is test issue ${i + 1}`,
    labels: ['rsolv:automate'],
    assignees: [],
    repository: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
      defaultBranch: 'main'
    },
    source: 'github',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));
}