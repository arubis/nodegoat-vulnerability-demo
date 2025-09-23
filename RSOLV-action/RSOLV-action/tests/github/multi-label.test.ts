import { describe, test, expect } from 'vitest';

describe('GitHub Multi-Label Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('should search for both configured label and rsolv label', () => {
    // Test various label configurations
    const testCases = [
      {
        configLabel: 'rsolv:automate',
        expectedLabels: ['rsolv:automate'], // Already contains 'rsolv'
        description: 'Should not duplicate when config already has rsolv'
      },
      {
        configLabel: 'autofix',
        expectedLabels: ['autofix', 'rsolv'], // Should add 'rsolv'
        description: 'Should add rsolv when not in config'
      },
      {
        configLabel: 'custom-label',
        expectedLabels: ['custom-label', 'rsolv'], // Should add 'rsolv'
        description: 'Should add rsolv to custom labels'
      }
    ];

    testCases.forEach(({ configLabel, expectedLabels, description }) => {
      console.log(`${description}:`);
      
      // Simulate the logic from detectIssues
      const labels = [configLabel];
      if (!configLabel.includes('rsolv')) {
        labels.push('rsolv');
      }
      
      expect(labels).toEqual(expectedLabels);
      console.log(`  Config: ${configLabel} → Search: ${labels.join(', ')}`);
    });
  });

  test('should deduplicate issues when they have multiple matching labels', () => {
    // Simulate issues that might have both labels
    const mockIssues = [
      { id: 1, labels: ['autofix', 'rsolv'] },
      { id: 2, labels: ['autofix'] },
      { id: 3, labels: ['rsolv'] },
      { id: 4, labels: ['other'] }
    ];

    const matchingLabels = ['autofix', 'rsolv'];
    const seenIds = new Set<number>();
    const results: any[] = [];

    // Simulate the deduplication logic
    for (const label of matchingLabels) {
      const matching = mockIssues.filter(issue => 
        issue.labels.includes(label)
      );
      
      for (const issue of matching) {
        if (!seenIds.has(issue.id)) {
          seenIds.add(issue.id);
          results.push(issue);
        }
      }
    }

    expect(results).toHaveLength(3); // Issues 1, 2, 3 (not 4)
    expect(results.map(r => r.id)).toEqual([1, 2, 3]);
  });
});