# Claude Code and Ollama Integration

This document provides instructions for testing and using the hybrid approach with both Claude Code for context-gathering and Ollama for local AI inference.

## Overview

RSOLV supports a flexible approach where you can use:
1. Claude Code for intelligent context-gathering
2. Ollama for local execution of the solution generation

This combination allows you to leverage the sophisticated context exploration capabilities of Claude Code with the privacy and control of running AI models locally with Ollama.

## Setup Requirements

To use this hybrid approach, you need:

1. **Claude Code CLI**:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Ollama**:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

3. **Required Models**:
   ```bash
   # Pull a suitable code generation model
   ollama pull codellama  # or llama3, mistral-large, etc.
   ```

## Configuration

In your GitHub Action workflow:

```yaml
- name: RSOLV AI Fix
  uses: rsolv-dev/rsolv-action@main
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    ai_provider: ollama  # Use Ollama for solution generation
    ollama_model: codellama  # Specify which model to use
    use_claude_code: true  # Enable Claude Code for context-gathering
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}  # Required for Claude Code
```

For local testing:

```bash
export AI_PROVIDER=ollama
export OLLAMA_MODEL=codellama
export USE_CLAUDE_CODE=true
export ANTHROPIC_API_KEY=your_api_key_here

# Run the demo
cd RSOLV-action
bun run demo-env
```

## Testing Ollama Integration

We've added a dedicated test script for verifying your Ollama setup:

```bash
# Run the test script
./run-ollama-test.sh
```

This script will:
1. Check if Ollama is installed
2. Ensure the Ollama server is running
3. Verify the requested model is available
4. Run a test against the Ollama API
5. Display the results

### Remote Ollama Servers

To use a remote Ollama server:

```bash
export OLLAMA_API_KEY=http://your-server:11434/api:optional-token
./run-ollama-test.sh
```

## Hybrid Workflow Process

When using both Claude Code and Ollama:

1. RSOLV triggers Claude Code to analyze the repository context
2. The enhanced context is incorporated into the prompt
3. Ollama is used for the actual solution generation
4. The solution is formatted and returned in the standard RSOLV format

## Performance Considerations

- **Context Size**: Claude Code can gather extensive context, but be mindful of Ollama's context window limits
- **Model Selection**: For complex programming tasks, we recommend larger code-focused models like:
  - `codellama`
  - `codellama:34b`
  - `deepseek-coder`
  - `wizardcoder`

## Troubleshooting

### Common Issues

1. **Claude Code CLI not found**:
   - Ensure it's properly installed: `npm install -g @anthropic-ai/claude-code`
   - Verify it's in your PATH: `claude -v`

2. **Ollama server not responding**:
   - Start the server: `ollama serve`
   - Check it's running: `curl http://localhost:11434/api/version`

3. **Model not found**:
   - Pull the model: `ollama pull modelname`
   - List available models: `ollama list`

4. **Out of memory errors**:
   - Use a smaller model: `export OLLAMA_MODEL=llama3`
   - Adjust model parameters: `export OLLAMA_MODEL=llama3:8b`

### Testing Commands

```bash
# Test only Ollama
export USE_CLAUDE_CODE=false
export AI_PROVIDER=ollama
./run-ollama-test.sh

# Test only Claude Code
export USE_CLAUDE_CODE=true
export AI_PROVIDER=anthropic
./run-claude-code-test.sh

# Test hybrid approach
export USE_CLAUDE_CODE=true
export AI_PROVIDER=ollama
bun run demo-env
```

## Next Steps

We plan to enhance this integration with:
1. Automatic context window management
2. Pre-processing Claude Code context to fit Ollama models
3. More sophisticated model parameter configuration
4. Multiple Ollama model support for different tasks