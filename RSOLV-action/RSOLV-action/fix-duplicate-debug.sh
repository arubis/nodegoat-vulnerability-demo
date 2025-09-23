#!/bin/bash

# Fix duplicate debug entries in test files

files=(
  "src/ai/__tests__/claude-code-integration.test.ts"
  "src/ai/__tests__/claude-code.test.ts"
  "src/ai/__tests__/client.test.ts"
  "src/ai/__tests__/git-based-processor-characterization.test.ts"
  "src/ai/__tests__/unified-processor-vulnerability-flow.test.ts"
  "src/ai/providers/__tests__/ollama.test.ts"
  "src/ai/adapters/__tests__/claude-code-enhanced.test.ts"
  "src/ai/adapters/__tests__/claude-code-git-data-flow.test.ts"
  "src/ai/adapters/__tests__/claude-code-git.test.ts"
  "src/ai/adapters/__tests__/claude-code.test.ts"
  "src/config/__tests__/timeout.test.ts"
  "src/github/__tests__/label-manager.test.ts"
  "src/security/pattern-source.test.ts"
)

for file in "${files[@]}"; do
  echo "Fixing $file"
  # Use perl for more complex multiline replacement
  perl -i -0pe 's/(logger:\s*\{\s*debug:[^,\n]+,\s*)\n\s*[^}]*debug:[^,\n]+,/\1/g' "$file"
done

echo "Fixed ${#files[@]} files"