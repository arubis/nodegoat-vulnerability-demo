import { logger } from '../utils/logger.js';

interface Label {
  name: string;
  color: string;
  description: string;
}

const REQUIRED_LABELS: Label[] = [
  {
    name: 'rsolv:detected',
    color: 'FBCA04',
    description: 'Issue detected by RSOLV security scan'
  },
  {
    name: 'rsolv:validate', 
    color: '0E8A16',
    description: 'Trigger RSOLV validation phase'
  },
  {
    name: 'rsolv:automate',
    color: '0052CC', 
    description: 'Trigger RSOLV fix generation'
  },
  {
    name: 'security',
    color: 'D93F0B',
    description: 'Security vulnerability'
  },
  {
    name: 'automated-scan',
    color: 'C5DEF5',
    description: 'Created by automated security scan'
  },
  {
    name: 'critical',
    color: 'B60205',
    description: 'Critical severity'
  },
  {
    name: 'high',
    color: 'D93F0B', 
    description: 'High severity'
  },
  {
    name: 'medium',
    color: 'FBCA04',
    description: 'Medium severity'
  },
  {
    name: 'low',
    color: '0E8A16',
    description: 'Low severity'
  }
];

/**
 * Ensures all required labels exist in the repository.
 * Creates any missing labels automatically without failing the action.
 */
export async function ensureLabelsExist(
  owner: string,
  repo: string,
  token: string
): Promise<void> {
  logger.info('Ensuring required labels exist...');
  
  try {
    const existingNames = await fetchExistingLabels(owner, repo, token);
    if (!existingNames) return; // API error, skip label creation
    
    await createMissingLabels(owner, repo, token, existingNames);
    logger.info('Label check complete');
  } catch (error) {
    logger.error('Failed to ensure labels exist', error);
    // Don't fail the action if label creation fails
  }
}

async function fetchExistingLabels(
  owner: string,
  repo: string,
  token: string
): Promise<Set<string> | null> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/labels`,
    { headers: getHeaders(token) }
  );
  
  if (!response.ok) {
    logger.warn(`Failed to fetch labels: ${response.status}. Skipping label creation.`);
    return null;
  }
  
  const labels = await response.json() as Array<{ name: string }>;
  return new Set(labels.map(l => l.name.toLowerCase()));
}

async function createMissingLabels(
  owner: string,
  repo: string,
  token: string,
  existingNames: Set<string>
): Promise<void> {
  const missingLabels = REQUIRED_LABELS.filter(
    label => !existingNames.has(label.name.toLowerCase())
  );
  
  for (const label of missingLabels) {
    await createLabel(owner, repo, token, label);
  }
}

async function createLabel(
  owner: string,
  repo: string,
  token: string,
  label: Label
): Promise<void> {
  logger.info(`Creating missing label: ${label.name}`);
  
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/labels`,
    {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(label)
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    logger.warn(`Failed to create label ${label.name}: ${error}`);
  } else {
    logger.info(`✅ Created label: ${label.name}`);
  }
}

function getHeaders(token: string): HeadersInit {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}