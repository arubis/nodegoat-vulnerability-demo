# RSOLV System Architecture & Data Flow

## Overview
This document illustrates the complete data flow from issue detection through PR creation, showing how modules interact and how Claude Code orchestrates the solution generation.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Issue Detection Layer"
        GH[GitHub Issues API]
        JI[Jira Integration]
        LI[Linear Integration]
        ID[Issue Detector<br/>src/platforms/issue-detector.ts]
    end

    subgraph "Analysis Layer"
        AN[Analyzer<br/>src/ai/analyzer.ts]
        SA[Security Analyzer<br/>src/ai/security-analyzer.ts]
        SD[Security Detector<br/>src/security/detector.ts]
        SP[Security Patterns<br/>src/security/patterns.ts]
    end

    subgraph "LLM Orchestration Layer"
        AC[AI Client Factory<br/>src/ai/client.ts]
        CC[Claude Code Adapter<br/>src/ai/adapters/claude-code.ts]
        AP[Anthropic Client]
        CM[Credential Manager<br/>src/credentials/manager.ts]
    end

    subgraph "Solution Generation Layer"
        SG[Solution Generator<br/>src/ai/solution.ts]
        FE[Feedback Enhanced<br/>src/ai/feedbackEnhanced.ts]
        PR[Prompt Builder<br/>src/ai/prompts.ts]
        EF[Explanation Framework<br/>src/security/explanation-framework.ts]
    end

    subgraph "PR Creation Layer"
        PC[PR Creator<br/>src/github/pr.ts]
        GF[GitHub Files<br/>src/github/files.ts]
        GA[GitHub API<br/>src/github/api.ts]
        RC[RSOLV API Client<br/>src/external/api-client.ts]
    end

    GH --> ID
    JI --> ID
    LI --> ID
    ID --> AN
    AN --> SA
    SA --> SD
    SD --> SP
    AN --> AC
    SA --> AC
    AC --> CC
    AC --> AP
    CM --> AC
    CC --> SG
    AP --> SG
    SG --> FE
    FE --> PR
    SG --> EF
    EF --> PC
    SG --> PC
    PC --> GF
    PC --> GA
    PC --> RC
```

## Detailed Module Flow

### 1. Issue Detection & Processing

```mermaid
sequenceDiagram
    participant User
    participant GHA as GitHub Action
    participant ID as IssueDetector
    participant UP as UnifiedProcessor
    
    User->>GHA: Trigger on issue labeled 'rsolv:automate'
    GHA->>ID: detectIssuesFromAllPlatforms()<br/>[src/platforms/issue-detector.ts:10]
    ID->>ID: GitHub: detectIssues()<br/>[src/github/issues.ts:8]
    ID->>ID: Jira: detectIssues()<br/>[src/platforms/jira/jira-adapter.ts]
    ID->>ID: Linear: detectIssues()<br/>[src/platforms/linear/linear-adapter.ts]
    ID-->>UP: IssueContext[]
    UP->>UP: processIssues(issues, config, options)<br/>[src/ai/unified-processor.ts:35]
```

### 2. Issue Analysis Flow

```mermaid
sequenceDiagram
    participant UP as UnifiedProcessor
    participant AN as Analyzer
    participant SA as SecurityAnalyzer
    participant AC as AIClient
    participant CC as ClaudeCode
    
    UP->>AN: analyzeIssue(issue, config)<br/>[src/ai/analyzer.ts:10]
    AN->>AN: buildAnalysisPrompt(issue)<br/>[src/ai/prompts.ts]
    AN->>AC: getAiClient(config.aiProvider)<br/>[src/ai/client.ts:32]
    
    alt provider === 'claude-code'
        AC->>CC: new ClaudeCodeAdapter()<br/>[src/ai/adapters/claude-code.ts]
        CC->>CC: gatherDeepContext()
        CC-->>AN: Enhanced AnalysisData
    else other providers
        AC->>AC: new AnthropicClient()<br/>[src/ai/client.ts:192]
        AC-->>AN: Standard AnalysisData
    end
    
    alt enableSecurityAnalysis
        UP->>SA: analyzeWithSecurity(issue, config)<br/>[src/ai/security-analyzer.ts:26]
        SA->>SA: performSecurityAnalysis(files)<br/>[src/ai/security-analyzer.ts:60]
        SA-->>UP: AnalysisData + SecurityAnalysisResult
    end
```

### 3. Solution Generation with Claude Code

```mermaid
sequenceDiagram
    participant SG as SolutionGenerator
    participant CC as ClaudeCodeAdapter
    participant PR as PromptBuilder
    participant FE as FeedbackEnhanced
    participant EF as ExplanationFramework
    
    SG->>SG: generateSolution(issue, analysis, config)<br/>[src/ai/solution.ts:22]
    
    alt config.aiProvider.provider === 'claude-code'
        SG->>CC: claudeCodeAdapter.generateSolution()<br/>[src/ai/adapters/claude-code.ts]
        CC->>CC: Enhanced context gathering
        CC->>CC: Multiple file analysis
        CC->>CC: Dependency tracking
        CC-->>SG: Enhanced solution with metadata
    else
        SG->>PR: buildSolutionPrompt(issue, analysis, files)<br/>[src/ai/prompts.ts]
        
        alt Has security vulnerabilities
            SG->>EF: generateCompleteExplanation(vulnerabilities)<br/>[src/security/explanation-framework.ts:75]
            EF-->>SG: Three-tier explanations
        end
        
        SG->>FE: generateSolutionWithFeedback()<br/>[src/ai/feedbackEnhanced.ts]
        FE->>FE: Apply feedback patterns
        FE-->>SG: Enhanced solution
    end
    
    SG-->>SG: SolutionResult with changes map
```

### 4. Pull Request Creation

```mermaid
sequenceDiagram
    participant UP as UnifiedProcessor
    participant PC as PRCreator
    participant GA as GitHubAPI
    participant RC as RsolvAPIClient
    participant GH as GitHub
    
    UP->>PC: createPullRequest(issue, changes, analysis)<br/>[src/github/pr.ts:33]
    PC->>PC: Create branch name
    PC->>GA: Create new branch
    PC->>GA: Commit changes to branch
    PC->>PC: generatePrDescription()<br/>[src/github/pr.ts:264]
    
    alt Has security analysis
        PC->>PC: Add security impact section
        PC->>PC: Add three-tier explanations
    end
    
    PC->>GA: Create pull request
    GA-->>GH: New PR created
    
    PC->>RC: recordFixAttempt(prData)<br/>[src/external/api-client.ts:67]
    RC->>RC: POST /api/v1/fix-attempts
    RC-->>PC: Fix attempt recorded
    
    PC-->>UP: PullRequestResult
```

## Key Function Signatures

### Issue Detection
```typescript
// src/platforms/issue-detector.ts
export async function detectIssuesFromAllPlatforms(
  config: ActionConfig
): Promise<IssueContext[]>

// src/github/issues.ts
export async function detectIssues(
  config: ActionConfig
): Promise<IssueContext[]>
```

### Analysis Layer
```typescript
// src/ai/analyzer.ts
export async function analyzeIssue(
  issue: IssueContext,
  config: ActionConfig,
  injectedClient?: any
): Promise<AnalysisData>

// src/ai/security-analyzer.ts
async analyzeWithSecurity(
  issue: IssueContext,
  config: ActionConfig,
  codebaseFiles?: Map<string, string>
): Promise<AnalysisData & { securityAnalysis?: SecurityAnalysisResult }>
```

### LLM Orchestration
```typescript
// src/ai/client.ts
export async function getAiClient(
  config: AiProviderConfig
): Promise<AiClient>

// src/ai/adapters/claude-code.ts
export class ClaudeCodeAdapter {
  async generateSolution(
    issue: IssueContext,
    analysis: AnalysisData,
    enhancedPrompt?: string
  ): Promise<SolutionResult>
}
```

### Solution Generation
```typescript
// src/ai/solution.ts
export async function generateSolution(
  issue: IssueContext,
  analysisData: AnalysisData,
  config: ActionConfig,
  injectedClient?: any,
  _injectedFileGetter?: any,
  securityAnalysis?: any
): Promise<SolutionResult>

// src/ai/feedbackEnhanced.ts
export async function generateSolutionWithFeedback(
  issue: IssueContext,
  analysis: AnalysisData,
  config: ActionConfig,
  basePrompt?: string
): Promise<SolutionResult>
```

### PR Creation
```typescript
// src/github/pr.ts
export async function createPullRequest(
  issue: IssueContext,
  changes: Record<string, string>,
  analysis: AnalysisData,
  config: ActionConfig,
  securityAnalysis?: SecurityAnalysisResult,
  explanations?: CompleteExplanation
): Promise<PullRequestResult>
```

## Prompt Flow & Enhancement

```mermaid
graph LR
    subgraph "Base Prompts"
        AP[Analysis Prompt]
        SP[Solution Prompt]
        PP[PR Description Prompt]
    end
    
    subgraph "Security Enhancements"
        SRP[Security Requirements]
        VDP[Vulnerability Details]
        FTP[Fix Templates]
    end
    
    subgraph "Feedback Patterns"
        FDB[Feedback Database]
        FPT[Pattern Matcher]
        EPR[Enhanced Prompt]
    end
    
    subgraph "Claude Code Context"
        CXT[Deep Context]
        DPG[Dependency Graph]
        RPT[Repository Patterns]
    end
    
    AP --> SP
    SRP --> SP
    VDP --> SP
    FTP --> SP
    
    SP --> FPT
    FDB --> FPT
    FPT --> EPR
    
    CXT --> EPR
    DPG --> EPR
    RPT --> EPR
    
    EPR --> PP
```

## Data Structures

### IssueContext
```typescript
interface IssueContext {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  repository: RepositoryInfo;
  source: 'github' | 'jira' | 'linear';
}
```

### AnalysisData
```typescript
interface AnalysisData {
  issueType: IssueType;
  filesToModify: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  suggestedApproach: string;
  canBeFixed: boolean;
  confidenceScore: number;
  securityAnalysis?: SecurityAnalysisResult;
}
```

### SolutionResult
```typescript
interface SolutionResult {
  success: boolean;
  message: string;
  changes?: Record<string, string>; // filepath -> new content
  error?: string;
  explanations?: CompleteExplanation;
}
```

## Claude Code Integration Points

1. **Provider Detection**: `src/ai/client.ts:46-59`
   - Maps 'claude-code' to AnthropicClient
   - Enables special handling in solution generator

2. **Enhanced Context**: `src/ai/solution.ts:34-46`
   - Detects claude-code provider
   - Uses ClaudeCodeAdapter for deep context

3. **Solution Generation**: `src/ai/adapters/claude-code.ts`
   - Gathers repository-wide context
   - Analyzes dependencies
   - Generates comprehensive fixes

4. **Credential Vending**: `src/credentials/manager.ts`
   - Exchanges RSOLV API key for provider credentials
   - Manages rate limits and quotas

## Security Analysis Flow

```mermaid
graph TD
    SF[Source Files] --> SD[Security Detector]
    SD --> PS[Pattern Scanner]
    PS --> CVE[CVE Patterns]
    PS --> OWA[OWASP Patterns]
    PS --> CUS[Custom Patterns]
    
    CVE --> VUL[Vulnerability List]
    OWA --> VUL
    CUS --> VUL
    
    VUL --> EXP[Explanation Framework]
    EXP --> BUS[Business Level]
    EXP --> CON[Concept Level]
    EXP --> LIN[Line Level]
    
    BUS --> PR[PR Description]
    CON --> PR
    LIN --> PR
```

This architecture enables RSOLV to provide comprehensive, security-aware, and educational pull requests that not only fix issues but also help teams understand and prevent future occurrences.