# Ollama Integration

This document explains how to use Ollama with the RSOLV-action project.

## Prerequisites

1. Install Ollama CLI:
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. Start Ollama server:
   ```bash
   ollama serve
   ```

3. Pull the recommended model:
   ```bash
   ollama pull deepseek-r1:14b
   ```

## Usage

You can use Ollama as an AI provider in the RSOLV-action project through several methods:

### 1. Using the Test Script

Run the test script to verify Ollama integration:

```bash
./run-ollama-test.sh
```

This script:
- Verifies Ollama is installed
- Checks if the server is running (starts one if needed)
- Ensures the required model is available
- Runs a test analysis and solution generation

You can specify a custom model:

```bash
OLLAMA_MODEL=codellama ./run-ollama-test.sh
```

### 2. Using the Demo Environment

The demo environment supports Ollama as an AI provider:

```bash
PROVIDER=ollama bun run demo-env
```

Additional options:
- `OLLAMA_MODEL=deepseek-r1:14b` - Specify which model to use (default: deepseek-r1:14b)
- `OLLAMA_API_KEY=http://server:11434/api:token` - For remote servers

### 3. Using it as a Fallback

Ollama can be configured as a fallback provider if the primary provider fails:

```bash
FALLBACK_PROVIDER=ollama bun run demo-env
```

## Supported Models

The following models have been tested with RSOLV-action:

| Model | Description | Performance | Size |
|-------|-------------|-------------|------|
| deepseek-r1:14b | Deepseek LLAMA-R model | Excellent for code tasks | 14B parameters |
| llama3:8b | Llama 3 model | Good all-around performance | 8B parameters |
| codellama | Specialized for code tasks | Excellent for complex code | 7B-34B parameters |
| mistral | Alternative model | Good performance | 7B parameters |
| phi3 | Small but capable model | Decent for simple issues | 3.8B parameters |

## Implementation Details

The Ollama integration is implemented in `src/ai/providers/ollama.ts` and includes:

- Support for both `/generate` and `/chat` endpoints
- Automatic fallback between endpoints for compatibility with various Ollama versions
- Customizable parameters for temperature, context window, and response format
- Advanced error handling with informative messages for common issues
- Extensive JSON preprocessing to handle model-specific output formats
- Robust fallback mechanisms for production reliability
- Optimized for deepseek-r1:14b model responses

## Troubleshooting

Common issues and solutions:

1. **Connection refused**
   - Make sure Ollama server is running (`ollama serve`)
   - Check if the server is running on the default port (11434)

2. **Model not found**
   - Pull the required model: `ollama pull MODEL_NAME`
   - Check available models: `ollama list`

3. **Out of memory errors**
   - Try a smaller model (llama3.2:3b instead of larger models)
   - Increase system RAM or use a machine with more resources

4. **Slow responses**
   - Enable GPU acceleration if available
   - Consider using a remote Ollama server with more resources

5. **JSON parsing errors**
   - Our system includes comprehensive error handling for JSON parsing issues
   - Enhanced JSON preprocessing handles common model formatting quirks
   - Special optimization for deepseek-r1:14b model response format
   - In development mode, mock data is generated if JSON parsing fails
   - Advanced regex patterns to extract JSON from various response formats
   - Set `NODE_ENV=development` to use fallback mock data if needed

## Remote Server Usage

You can use a remote Ollama server by setting the `OLLAMA_API_KEY` environment variable:

```bash
OLLAMA_API_KEY=http://your-server:11434/api:your-token ./run-ollama-test.sh
```

This allows you to:
- Use more powerful hardware for inference
- Access models not available locally
- Share models across team members