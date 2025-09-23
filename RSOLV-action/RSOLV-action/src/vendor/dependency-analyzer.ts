/**
 * RFC-047: Dependency Analysis Implementation
 */

import * as path from 'path';
import * as fs from 'fs/promises';

export class DependencyAnalyzer {
  async parsePackageJson(packageJson: any): Promise<Map<string, string>> {
    const dependencies = new Map<string, string>();
    
    // Add regular dependencies
    if (packageJson.dependencies) {
      Object.entries(packageJson.dependencies).forEach(([name, version]) => {
        dependencies.set(name, version as string);
      });
    }
    
    // Add dev dependencies
    if (packageJson.devDependencies) {
      Object.entries(packageJson.devDependencies).forEach(([name, version]) => {
        dependencies.set(name, version as string);
      });
    }
    
    // Add peer dependencies
    if (packageJson.peerDependencies) {
      Object.entries(packageJson.peerDependencies).forEach(([name, version]) => {
        dependencies.set(name, version as string);
      });
    }
    
    return dependencies;
  }
  
  isKnownDependency(filePath: string, dependencies: Map<string, string>): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Check if file is in node_modules for a known dependency
    for (const [depName, _version] of dependencies) {
      if (normalizedPath.includes(`node_modules/${depName}/`)) {
        return true;
      }
      
      // Also check vendor directories
      if (normalizedPath.includes(`vendor/${depName}/`) ||
          normalizedPath.includes(`vendor/${depName}.`) ||
          normalizedPath.includes(`/${depName}-`) ||
          normalizedPath.includes(`/${depName}.`)) {
        return true;
      }
    }
    
    return false;
  }
  
  async findManifests(rootDir: string = '.'): Promise<Array<{type: string, path: string}>> {
    const manifests = [];
    
    try {
      // Check for package.json (npm)
      const packageJsonPath = path.join(rootDir, 'package.json');
      try {
        await fs.access(packageJsonPath);
        manifests.push({ type: 'npm', path: packageJsonPath });
      } catch {
        // Not found
      }
      
      // Check for requirements.txt (pip)
      const requirementsPath = path.join(rootDir, 'requirements.txt');
      try {
        await fs.access(requirementsPath);
        manifests.push({ type: 'python', path: requirementsPath });
      } catch {
        // Not found
      }
      
      // Check for Gemfile (ruby)
      const gemfilePath = path.join(rootDir, 'Gemfile');
      try {
        await fs.access(gemfilePath);
        manifests.push({ type: 'ruby', path: gemfilePath });
      } catch {
        // Not found
      }
      
      // Check for composer.json (php)
      const composerPath = path.join(rootDir, 'composer.json');
      try {
        await fs.access(composerPath);
        manifests.push({ type: 'php', path: composerPath });
      } catch {
        // Not found
      }
    } catch (error) {
      console.error('Error finding manifests:', error);
    }
    
    return manifests;
  }
  
  async analyzeDependencies(rootDir: string = '.'): Promise<Map<string, Map<string, string>>> {
    const allDependencies = new Map<string, Map<string, string>>();
    const manifests = await this.findManifests(rootDir);
    
    for (const manifest of manifests) {
      try {
        switch (manifest.type) {
          case 'npm':
            const packageContent = await fs.readFile(manifest.path, 'utf-8');
            const packageJson = JSON.parse(packageContent);
            const npmDeps = await this.parsePackageJson(packageJson);
            allDependencies.set('npm', npmDeps);
            break;
            
          case 'python':
            const reqContent = await fs.readFile(manifest.path, 'utf-8');
            const pipDeps = this.parseRequirementsTxt(reqContent);
            allDependencies.set('pip', pipDeps);
            break;
            
          case 'ruby':
            const gemContent = await fs.readFile(manifest.path, 'utf-8');
            const gemDeps = this.parseGemfile(gemContent);
            allDependencies.set('gem', gemDeps);
            break;
            
          case 'php':
            const composerContent = await fs.readFile(manifest.path, 'utf-8');
            const composerJson = JSON.parse(composerContent);
            const composerDeps = this.parseComposerJson(composerJson);
            allDependencies.set('composer', composerDeps);
            break;
        }
      } catch (error) {
        console.error(`Error parsing ${manifest.type} manifest:`, error);
      }
    }
    
    return allDependencies;
  }
  
  private parseRequirementsTxt(content: string): Map<string, string> {
    const deps = new Map<string, string>();
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Parse lines like: package==1.2.3 or package>=1.0.0
        const match = trimmed.match(/^([a-zA-Z0-9-_]+)([><=~!]+)(.+)$/);
        if (match) {
          deps.set(match[1], match[2] + match[3]);
        } else {
          // Package without version
          deps.set(trimmed, '*');
        }
      }
    }
    
    return deps;
  }
  
  private parseGemfile(content: string): Map<string, string> {
    const deps = new Map<string, string>();
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Parse lines like: gem 'rails', '~> 6.1.0'
      const match = trimmed.match(/gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
      if (match) {
        deps.set(match[1], match[2] || '*');
      }
    }
    
    return deps;
  }
  
  private parseComposerJson(composerJson: any): Map<string, string> {
    const deps = new Map<string, string>();
    
    if (composerJson.require) {
      Object.entries(composerJson.require).forEach(([name, version]) => {
        // Skip PHP version requirement
        if (!name.startsWith('php')) {
          deps.set(name, version as string);
        }
      });
    }
    
    if (composerJson['require-dev']) {
      Object.entries(composerJson['require-dev']).forEach(([name, version]) => {
        deps.set(name, version as string);
      });
    }
    
    return deps;
  }
}