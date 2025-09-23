import { logger } from '../utils/logger.js';
import { IssueContext } from '../types/index.js';
import { getGitHubClient } from './api.js';

/**
 * Get repository files based on the file paths
 */
export async function getRepositoryFiles(
  issue: IssueContext,
  filePaths: string[]
): Promise<Record<string, string>> {
  try {
    logger.info(`Fetching ${filePaths.length} files from repository ${issue.repository.fullName}`);
    
    const fileContents: Record<string, string> = {};
    
    // Get GitHub client
    const github = getGitHubClient();
    const { owner, name: repo } = issue.repository;
    
    // Process files in batches to avoid rate limiting (5 files at a time)
    const batchSize = 5;
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (filePath) => {
        try {
          // Use GitHub API to fetch file content
          const response = await github.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: issue.repository.defaultBranch
          });
          
          // Check if response is a file (not a directory)
          if (Array.isArray(response.data)) {
            throw new Error(`Path ${filePath} is a directory, not a file`);
          }
          
          // Extract and decode content (only files have content)
          if (response.data.type === 'file' && 'content' in response.data) {
            const content = response.data.content;
            // GitHub API returns base64 encoded content
            fileContents[filePath] = Buffer.from(content, 'base64').toString('utf-8');
          } else {
            logger.warn(`Unknown file type for ${filePath}: ${response.data.type}`);
          }
        } catch (error) {
          logger.warn(`Failed to fetch content for ${filePath}`, error);
        }
      }));
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return fileContents;
  } catch (error) {
    logger.error(`Error fetching repository files for ${issue.repository.fullName}`, error);
    throw new Error(`Failed to fetch repository files: ${error instanceof Error ? error.message : String(error)}`);
  }
}