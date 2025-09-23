import { JiraAdapter } from './jira/jira-adapter.js';
import { LinearAdapter } from './linear/linear-adapter.js';
import type { PlatformAdapter, PlatformConfig } from './types.js';

export class PlatformFactory {
  static create(platform: string, config: PlatformConfig): PlatformAdapter {
    switch (platform) {
    case 'jira':
      if (!config.jira) {
        throw new Error('Jira configuration is required');
      }
      return new JiraAdapter(config.jira);
      
    case 'linear':
      if (!config.linear) {
        throw new Error('Linear configuration is required');
      }
      return new LinearAdapter(config.linear);
      
    case 'gitlab':
      throw new Error('GitLab integration not yet implemented');
      
    default:
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

}