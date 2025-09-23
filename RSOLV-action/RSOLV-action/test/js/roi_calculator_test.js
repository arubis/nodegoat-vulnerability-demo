/**
 * ROI Calculator Test Suite
 * Tests the functionality of the ROI calculator component
 */

// Mock document elements
const mockElements = {};
const mockEventListeners = {};

// Mock document.getElementById
document.getElementById = jest.fn(id => {
  if (!mockElements[id]) {
    mockElements[id] = {
      value: '',
      textContent: '',
      addEventListener: jest.fn((event, listener) => {
        if (!mockEventListeners[id]) {
          mockEventListeners[id] = {};
        }
        mockEventListeners[id][event] = listener;
      }),
      style: {
        width: ''
      }
    };
  }
  return mockElements[id];
});

// Import the calculator function
import { initRoiCalculator, calculateRoi } from '../../assets/js/roi_calculator';

describe('ROI Calculator', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    Object.keys(mockElements).forEach(key => delete mockElements[key]);
    Object.keys(mockEventListeners).forEach(key => delete mockEventListeners[key]);

    // Create mock elements for the calculator
    ['team-size', 'avg-salary', 'platform-count', 'monthly-issues', 
     'monthly-issues-value', 'annual-cost', 'context-switching', 
     'security-overhead', 'inefficiency-cost', 'platform-savings',
     'security-enhancement', 'rsolv-cost', 'annual-savings',
     'jira-savings', 'linear-savings', 'github-savings', 'gitlab-savings',
     'savings-bar', 'cost-bar', 'percent-cost', 'percent-savings',
     'pricing-tier', 'monthly-fixes', 'roi', 'payback'
    ].forEach(id => {
      document.getElementById(id);
    });

    // Set initial values for select elements
    mockElements['team-size'].value = '10';
    mockElements['avg-salary'].value = '150000';
    mockElements['platform-count'].value = '2';
    mockElements['monthly-issues'].value = '50';
  });

  test('Calculator should initialize with default values', () => {
    // Initialize the calculator
    initRoiCalculator();

    // Check that initial values are set correctly
    expect(mockElements['annual-cost'].textContent).toBe('$1,500,000');
    expect(mockElements['context-switching'].textContent).toBe('15%');
    expect(mockElements['security-overhead'].textContent).toBe('10%');
    expect(mockElements['inefficiency-cost'].textContent).toBe('$375,000');
    
    // Check that ROI values are calculated correctly
    expect(mockElements['platform-savings'].textContent).toBe('12%');
    expect(mockElements['security-enhancement'].textContent).toBe('8%');
    expect(mockElements['rsolv-cost'].textContent).toBe('$8,400');
    expect(mockElements['annual-savings'].textContent).toBe('$291,600');
    
    // Verify platform-specific savings
    expect(mockElements['jira-savings'].textContent).toBe('$54,000');
    expect(mockElements['linear-savings'].textContent).toBe('$67,500');
    expect(mockElements['github-savings'].textContent).toBe('$90,000');
    expect(mockElements['gitlab-savings'].textContent).toBe('$80,100');
    
    // Check ROI and payback period
    expect(mockElements['roi'].textContent).toBe('3471%');
    expect(mockElements['payback'].textContent).toBe('~0.4 months');
  });

  test('Calculator should update when team size changes', () => {
    // Initialize the calculator
    initRoiCalculator();
    
    // Change team size and trigger the event
    mockElements['team-size'].value = '25';
    mockEventListeners['team-size'].change();
    
    // Verify that calculations are updated
    expect(mockElements['annual-cost'].textContent).toBe('$3,750,000');
    expect(mockElements['inefficiency-cost'].textContent).toBe('$937,500');
    expect(mockElements['annual-savings'].textContent).toBe('$733,600');
    
    // Check ROI is updated
    expect(mockElements['roi'].textContent).not.toBe('3471%');
  });

  test('Calculator should update when salary changes', () => {
    // Initialize the calculator
    initRoiCalculator();
    
    // Change salary and trigger the event
    mockElements['avg-salary'].value = '200000';
    mockEventListeners['avg-salary'].change();
    
    // Verify that calculations are updated
    expect(mockElements['annual-cost'].textContent).toBe('$2,000,000');
    expect(mockElements['inefficiency-cost'].textContent).toBe('$500,000');
    expect(mockElements['annual-savings'].textContent).toBe('$416,600');
    
    // Check ROI is updated
    expect(mockElements['roi'].textContent).not.toBe('3471%');
  });

  test('Calculator should update when platform count changes', () => {
    // Initialize the calculator
    initRoiCalculator();
    
    // Change platform count and trigger the event
    mockElements['platform-count'].value = '4';
    mockEventListeners['platform-count'].change();
    
    // Verify that platform-specific calculations are updated
    expect(mockElements['context-switching'].textContent).not.toBe('15%');
    expect(mockElements['platform-savings'].textContent).not.toBe('12%');
    
    // Check platform pricing is updated
    expect(mockElements['pricing-tier'].textContent).toContain('Enterprise');
    expect(mockElements['roi'].textContent).not.toBe('3471%');
  });

  test('Calculator should update when monthly issues change', () => {
    // Initialize the calculator
    initRoiCalculator();
    
    // Change monthly issues and trigger the event
    mockElements['monthly-issues'].value = '100';
    mockEventListeners['monthly-issues'].input();
    
    // Verify that monthly issues display is updated
    expect(mockElements['monthly-issues-value'].textContent).toBe('100 issues/month');
    
    // Check that cost calculations are updated
    expect(mockElements['rsolv-cost'].textContent).not.toBe('$8,400');
    expect(mockElements['monthly-fixes'].textContent).not.toBe('40');
    
    // Check ROI is updated
    expect(mockElements['roi'].textContent).not.toBe('3471%');
  });

  test('calculateRoi function should return correct values', () => {
    // Test the core calculation function directly
    const result = calculateRoi({
      teamSize: 10,
      avgSalary: 150000,
      platformCount: 2,
      monthlyIssues: 50
    });
    
    // Check core calculation results
    expect(result.annualCost).toBe(1500000);
    expect(result.contextSwitching).toBe(0.15);
    expect(result.securityOverhead).toBe(0.1);
    expect(result.inefficiencyCost).toBe(375000);
    expect(result.platformSavings).toBe(0.12);
    expect(result.securityEnhancement).toBe(0.08);
    expect(result.rsolvCost).toBe(8400);
    expect(result.annualSavings).toBe(291600);
    expect(result.roi).toBe(3471);
    expect(result.costPercentage).toBe(3);
    expect(result.savingsPercentage).toBe(97);
  });
});