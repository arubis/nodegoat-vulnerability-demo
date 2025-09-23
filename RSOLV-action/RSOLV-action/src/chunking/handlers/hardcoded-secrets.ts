/**
 * RFC-046: Special Handler for Hardcoded Secrets
 */

import { HardcodedSecret, FixResult } from '../types.js';

export class HardcodedSecretsHandler {
  async handle(vulnerability: HardcodedSecret): Promise<FixResult> {
    const secretType = this.identifySecretType(vulnerability);
    const replacement = this.determineReplacement(secretType, vulnerability);
    const codeFix = this.generateCodeFix(vulnerability, replacement);
    const setupGuide = this.generateSetupGuide(vulnerability, replacement);
    
    return {
      success: true,
      codeFix,
      setupGuide,
      instructions: setupGuide,
      pr: {
        title: `[RSOLV] Remove hardcoded ${secretType}`,
        body: `Replaces hardcoded ${secretType} with environment variable`,
        branch: `rsolv/fix-hardcoded-${secretType}`,
        files: [{
          path: vulnerability.file,
          lines: [vulnerability.line],
          severity: 'CRITICAL'
        }]
      },
      validationSteps: [
        `Ensure ${replacement.envVar} is set in your environment`,
        'Test the application with the new configuration',
        'Verify the secret is no longer visible in the code'
      ]
    };
  }
  
  private identifySecretType(vulnerability: HardcodedSecret): string {
    // Use provided type or detect from content
    if (vulnerability.secretType) {
      return vulnerability.secretType.replace('_', ' ');
    }
    
    const secret = vulnerability.secret.toLowerCase();
    if (secret.includes('api') || secret.includes('key')) return 'api key';
    if (secret.includes('password') || secret.includes('pwd')) return 'password';
    if (secret.includes('token')) return 'token';
    if (secret.includes('cert')) return 'certificate';
    
    return 'secret';
  }
  
  private determineReplacement(secretType: string, vulnerability: HardcodedSecret): any {
    const envVarName = this.generateEnvVarName(secretType, vulnerability);
    
    return {
      envVar: envVarName,
      accessor: `process.env.${envVarName}`,
      configSection: vulnerability.context || 'configuration'
    };
  }
  
  private generateEnvVarName(secretType: string, vulnerability: HardcodedSecret): string {
    // Generate appropriate environment variable name
    if (vulnerability.context === 'database_connection') {
      return 'DATABASE_PASSWORD';
    }
    
    if (secretType === 'api key') {
      return 'API_KEY';
    }
    
    // Convert secret type to UPPER_SNAKE_CASE
    return secretType.toUpperCase().replace(/\s+/g, '_');
  }
  
  private generateCodeFix(vulnerability: HardcodedSecret, replacement: any): string {
    // Generate the code replacement
    const lines: string[] = [];
    
    // Extract the variable name if present
    const match = vulnerability.secret.match(/(\w+)\s*[=:]\s*["']([^"']+)["']/);
    
    if (match) {
      const [, varName, secretValue] = match;
      
      // Replace with environment variable
      if (vulnerability.secret.includes('=')) {
        lines.push(`${varName} = ${replacement.accessor}`);
      } else if (vulnerability.secret.includes(':')) {
        lines.push(`${varName}: ${replacement.accessor}`);
      }
    } else {
      // Direct replacement
      lines.push(replacement.accessor);
    }
    
    return lines.join('\n');
  }
  
  private generateSetupGuide(vulnerability: HardcodedSecret, replacement: any): string {
    const lines: string[] = [];
    
    lines.push('## Setup Instructions');
    lines.push('');
    lines.push('Set the following environment variable:');
    lines.push('');
    lines.push('```bash');
    
    // Extract the actual secret value for the guide
    const match = vulnerability.secret.match(/["']([^"']+)["']/);
    const secretValue = match ? match[1] : '<your-secret-value>';
    
    lines.push(`export ${replacement.envVar}="${secretValue}"`);
    lines.push('```');
    lines.push('');
    
    lines.push('Or add to your `.env` file:');
    lines.push('```');
    lines.push(`${replacement.envVar}=${secretValue}`);
    lines.push('```');
    lines.push('');
    
    if (vulnerability.context === 'database_connection') {
      lines.push('### Database Configuration');
      lines.push('Make sure your database connection uses the environment variable.');
      lines.push('');
    }
    
    lines.push('### Security Note');
    lines.push('Never commit secrets to version control. Use environment variables or a secure secret management system.');
    
    return lines.join('\n');
  }
}