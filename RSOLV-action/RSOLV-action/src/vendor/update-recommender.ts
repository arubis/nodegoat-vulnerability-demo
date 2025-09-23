/**
 * RFC-047: Update Recommendation System
 */

import { Library, UpdateRecommendation, UpdateStrategy } from './types.js';

export class UpdateRecommender {
  async recommendUpdate(library: Library, vulnerability: { id: string; severity?: string }): Promise<UpdateRecommendation> {
    const currentVersion = library.version;
    const fixedVersions = await this.findFixedVersions(library, vulnerability);
    const minimumSafeVersion = this.getMinimumSafeVersion(library, fixedVersions);
    const breakingChanges = await this.checkBreakingChanges(currentVersion, minimumSafeVersion);
    
    const strategies: UpdateStrategy[] = [];
    
    // Patch update (safest)
    strategies.push({
      type: 'patch',
      command: this.getUpdateCommand(library, 'patch'),
      risk: 'low',
      notes: 'Bug fixes only, no breaking changes'
    });
    
    // Minor update (moderate risk)
    if (breakingChanges === false || breakingChanges === null) {
      strategies.push({
        type: 'minor',
        command: this.getUpdateCommand(library, 'minor'),
        risk: 'medium',
        notes: 'New features, backward compatible'
      });
    }
    
    // Major update (highest risk)
    strategies.push({
      type: 'major',
      command: this.getUpdateCommand(library, 'major'),
      risk: 'high',
      notes: breakingChanges ? 'May require code changes' : 'Check changelog for breaking changes'
    });
    
    return {
      severity: vulnerability.severity || 'MEDIUM',
      currentVersion,
      fixedVersions,
      minimumSafeVersion,
      breakingChanges,
      updateStrategies: strategies
    };
  }
  
  private async findFixedVersions(library: Library, vulnerability: { id: string; severity?: string }): Promise<string[]> {
    // In real implementation, would query npm registry or security advisories
    // Mock some known fixes
    
    if (library.name === 'jquery') {
      if (library.version.startsWith('3.5.0')) {
        return ['3.5.1', '3.6.0', '3.6.4'];
      }
    }
    
    if (library.name === 'bootstrap') {
      if (library.version.startsWith('4.')) {
        return ['4.6.2', '5.0.0', '5.3.0'];
      }
    }
    
    // Default: suggest next patch, minor, and latest
    const parts = library.version.split('.');
    if (parts.length >= 3) {
      const major = parseInt(parts[0]);
      const minor = parseInt(parts[1]);
      const patch = parseInt(parts[2]);
      
      return [
        `${major}.${minor}.${patch + 1}`,
        `${major}.${minor + 1}.0`,
        'latest'
      ];
    }
    
    return ['latest'];
  }
  
  private getMinimumSafeVersion(library: Library, fixedVersions: string[]): string {
    // Return the lowest fixed version
    if (fixedVersions.length > 0 && fixedVersions[0] !== 'latest') {
      return fixedVersions[0];
    }
    
    // Special cases
    if (library.name === 'jquery' && library.version.startsWith('3.5.0')) {
      return '3.5.1';
    }
    
    if (library.name === 'bootstrap' && library.version.startsWith('4.')) {
      return '4.6.2';
    }
    
    return 'latest';
  }
  
  private async checkBreakingChanges(currentVersion: string, targetVersion: string): Promise<boolean | undefined> {
    // Simple semver check
    const current = this.parseVersion(currentVersion);
    const target = this.parseVersion(targetVersion);
    
    if (!current || !target) {
      return undefined;
    }
    
    // Major version change = breaking changes
    if (target.major > current.major) {
      return true;
    }
    
    // Same major version = no breaking changes
    return false;
  }
  
  private parseVersion(version: string): { major: number; minor: number; patch: number } | null {
    if (version === 'latest' || version === 'unknown') {
      return null;
    }
    
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
      };
    }
    
    return null;
  }
  
  private getUpdateCommand(library: Library, updateType: 'patch' | 'minor' | 'major'): string {
    const packageManager = library.packageManager || 'npm';
    const name = library.name;
    
    if (packageManager === 'npm') {
      switch (updateType) {
        case 'patch':
          return `npm update ${name}`;
        case 'minor':
          // Use caret to allow minor updates
          return `npm install ${name}@^${library.version}`;
        case 'major':
          return `npm install ${name}@latest`;
      }
    }
    
    // Generic command for other package managers
    return `${packageManager} update ${name}`;
  }
}