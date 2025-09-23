/**
 * Singleton credential manager to prevent multiple credential exchanges
 * and handle credential lifecycle properly
 */

import { RSOLVCredentialManager } from './manager.js';
import { logger } from '../utils/logger.js';

export class CredentialManagerSingleton {
  private static instances = new Map<string, RSOLVCredentialManager>();
  private static initPromises = new Map<string, Promise<RSOLVCredentialManager>>();
  
  /**
   * Get or create a credential manager instance for the given API key
   */
  static async getInstance(apiKey: string): Promise<RSOLVCredentialManager> {
    // Check if we already have an instance for this API key
    if (this.instances.has(apiKey)) {
      logger.debug(`Reusing existing credential manager for API key`);
      return this.instances.get(apiKey)!;
    }
    
    // Check if initialization is already in progress
    if (this.initPromises.has(apiKey)) {
      logger.debug(`Waiting for in-progress initialization for API key`);
      return this.initPromises.get(apiKey)!;
    }
    
    // Create initialization promise to handle concurrent requests
    const initPromise = this.createAndInitializeManager(apiKey);
    this.initPromises.set(apiKey, initPromise);
    
    try {
      const manager = await initPromise;
      return manager;
    } finally {
      // Clean up init promise
      this.initPromises.delete(apiKey);
    }
  }
  
  /**
   * Create and initialize a new manager instance
   */
  private static async createAndInitializeManager(apiKey: string): Promise<RSOLVCredentialManager> {
    // Create new instance
    logger.info(`Creating new credential manager instance`);
    const manager = new RSOLVCredentialManager();
    
    try {
      // Initialize with retry logic
      await this.initializeWithRetry(manager, apiKey);
      this.instances.set(apiKey, manager);
      return manager;
    } catch (error) {
      // Cleanup on failure
      manager.cleanup();
      throw error;
    }
  }
  
  /**
   * Initialize credential manager with retry logic
   */
  private static async initializeWithRetry(manager: RSOLVCredentialManager, apiKey: string, maxRetries = 3): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Initializing credential manager (attempt ${attempt}/${maxRetries})`);
        await manager.initialize(apiKey);
        return; // Success!
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Credential initialization failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt - 1);
          logger.debug(`Waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed to initialize credentials after ${maxRetries} attempts: ${lastError?.message}`);
  }
  
  /**
   * Clear a specific instance
   */
  static clearInstance(apiKey: string): void {
    const manager = this.instances.get(apiKey);
    if (manager) {
      manager.cleanup();
      this.instances.delete(apiKey);
      logger.debug(`Cleared credential manager instance for API key`);
    }
    // Also clear any pending init promise
    this.initPromises.delete(apiKey);
  }
  
  /**
   * Cleanup all instances
   */
  static cleanup(): void {
    logger.info(`Cleaning up ${this.instances.size} credential manager instances`);
    this.instances.forEach(manager => manager.cleanup());
    this.instances.clear();
    this.initPromises.clear();
  }
  
  /**
   * Get the number of active instances (for testing/monitoring)
   */
  static getInstanceCount(): number {
    return this.instances.size;
  }
}