/**
 * PhaseDataClient - Manages storage and retrieval of phase data
 * Implements RFC-041 Phase Data Storage specification
 */

export interface StoreResult {
  success: boolean;
  id?: string;
  message?: string;
  storage?: 'platform' | 'local';
  warning?: string;
}

export interface PhaseData {
  scan?: {
    vulnerabilities: Array<{
      type: string;
      file: string;
      line: number;
      [key: string]: any;
    }>;
    timestamp: string;
    commitHash: string;
  };
  
  // Platform returns 'validation', client uses 'validate' 
  validation?: {
    [issueId: string]: {
      validated: boolean;
      redTests?: any;
      testResults?: any;
      falsePositiveReason?: string;
      timestamp: string;
    };
  };
  
  // Alias for validation (after remapping)
  validate?: {
    [issueId: string]: {
      validated: boolean;
      redTests?: any;
      testResults?: any;
      falsePositiveReason?: string;
      timestamp: string;
    };
  };
  
  mitigation?: {
    [issueId: string]: {
      fixed: boolean;
      prUrl?: string;
      fixCommit?: string;
      timestamp: string;
    };
  };
  
  // Alias for mitigation (after remapping)
  mitigate?: {
    [issueId: string]: {
      fixed: boolean;
      prUrl?: string;
      fixCommit?: string;
      timestamp: string;
    };
  };
}

export class PhaseDataClient {
  private readonly headers: Headers;
  private readonly usePlatformStorage: boolean;
  
  constructor(
    private apiKey: string,
    private baseUrl: string = process.env.RSOLV_API_URL || 'https://api.rsolv.dev'
  ) {
    this.headers = new Headers({
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    });
    
    // Use platform storage by default, unless explicitly disabled
    this.usePlatformStorage = process.env.USE_PLATFORM_STORAGE !== 'false';
  }
  
  async storePhaseResults(
    phase: 'scan' | 'validate' | 'mitigate',
    data: PhaseData,
    metadata: {
      repo: string;
      issueNumber?: number;
      commitSha: string;
    }
  ): Promise<StoreResult> {
    // If platform storage is disabled, go straight to local
    if (!this.usePlatformStorage) {
      return this.storeLocally(phase, data, metadata);
    }
    
    try {
      // Map client phase names to platform phase names
      const phaseMapping: { [key: string]: string } = {
        'scan': 'scan',
        'validate': 'validation',
        'mitigate': 'mitigation'
      };
      
      const platformPhase = phaseMapping[phase] || phase;
      
      const response = await fetch(`${this.baseUrl}/api/v1/phases/store`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          phase: platformPhase,
          data,
          ...metadata
        })
      });
      
      if (!response.ok) {
        throw new Error(`Platform storage failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      return { ...result, storage: 'platform' as const };
    } catch (error) {
      // Fallback to local storage
      console.warn('Platform storage failed, falling back to local:', error);
      return this.storeLocally(phase, data, metadata);
    }
  }
  
  async retrievePhaseResults(
    repo: string,
    issueNumber: number,
    commitSha: string
  ): Promise<PhaseData | null> {
    // If platform storage is disabled, go straight to local
    if (!this.usePlatformStorage) {
      return this.retrieveLocally(repo, issueNumber, commitSha);
    }
    
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/phases/retrieve?` +
        `repo=${encodeURIComponent(repo)}&issue=${issueNumber}&commit=${encodeURIComponent(commitSha)}`,
        { headers: this.headers }
      );
      
      if (response.status === 404) {
        // Fallback to local storage immediately on 404
        return this.retrieveLocally(repo, issueNumber, commitSha);
      }
      
      if (!response.ok) {
        throw new Error(`Platform retrieval failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Log what we got from platform for debugging
      console.log('[PhaseDataClient] Retrieved from platform:', {
        hasValidation: !!data?.validation,
        hasValidate: !!data?.validate,
        keys: Object.keys(data || {})
      });
      
      // Map platform phase names back to client phase names if needed
      if (data && data.validation && !data.validate) {
        console.log('[PhaseDataClient] Mapping validation -> validate');
        data.validate = data.validation;
        delete data.validation;
      }
      if (data && data.mitigation && !data.mitigate) {
        console.log('[PhaseDataClient] Mapping mitigation -> mitigate');
        data.mitigate = data.mitigation;
        delete data.mitigation;
      }
      
      console.log('[PhaseDataClient] Returning data with keys:', Object.keys(data || {}));
      return data;
    } catch (error) {
      // Fallback to local storage
      console.warn('Platform retrieval failed, falling back to local:', error);
      return this.retrieveLocally(repo, issueNumber, commitSha);
    }
  }
  
  async validatePhaseTransition(
    fromPhase: string,
    toPhase: string,
    commitSha: string
  ): Promise<boolean> {
    // Check if commit has changed
    const currentSha = await this.getCurrentCommitSha();
    if (currentSha !== commitSha) {
      return false;  // Data is stale
    }
    
    // Validate phase progression
    const validTransitions: Record<string, string[]> = {
      'scan': ['validate'],
      'validate': ['mitigate'],
      'mitigate': []
    };
    
    return validTransitions[fromPhase]?.includes(toPhase) ?? false;
  }
  
  // Local storage fallback for platform unavailability
  private async storeLocally(
    phase: string,
    data: PhaseData,
    metadata: any
  ): Promise<StoreResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const dir = '.rsolv/phase-data';
    await fs.mkdir(dir, { recursive: true });
    
    const filename = `${metadata.repo.replace('/', '-')}-${metadata.issueNumber || 'scan'}-${phase}.json`;
    const filepath = path.join(dir, filename);
    
    await fs.writeFile(filepath, JSON.stringify({
      phase,
      data,
      metadata,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return { 
      success: true, 
      storage: 'local',
      warning: 'Platform unavailable, stored locally'
    };
  }
  
  private async retrieveLocally(
    repo: string,
    issueNumber: number,
    commitSha: string
  ): Promise<PhaseData | null> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const dir = '.rsolv/phase-data';
    const repoName = repo.replace('/', '-');
    const pattern = `${repoName}-${issueNumber}-`;
    
    try {
      const files = await fs.readdir(dir);
      const matches = files.filter(f => f.startsWith(pattern));
      
      const allData: PhaseData = {};
      for (const file of matches) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        const parsed = JSON.parse(content);
        
        // Only use if commit matches
        if (parsed.metadata.commitSha === commitSha) {
          Object.assign(allData, parsed.data);
        }
      }
      
      return Object.keys(allData).length > 0 ? allData : null;
    } catch {
      return null;
    }
  }
  
  private async getCurrentCommitSha(): Promise<string> {
    // First, check if GITHUB_SHA is available (provided by GitHub Actions and act)
    if (process.env.GITHUB_SHA) {
      return process.env.GITHUB_SHA.trim();
    }

    // Fall back to git command if available
    try {
      const { execSync } = await import('child_process');
      return execSync('git rev-parse HEAD').toString().trim();
    } catch (error) {
      // In act Docker containers, git may not be available
      // Use a fallback value to allow the action to continue
      console.warn('[PhaseDataClient] Git not available, using fallback commit SHA');
      return 'no-git-available';
    }
  }
}