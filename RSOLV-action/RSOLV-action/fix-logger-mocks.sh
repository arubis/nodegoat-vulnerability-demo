#!/bin/bash

# Fix logger mocks in test files to include debug method

echo "Fixing logger mocks in test files..."

# Find all test files with logger mocks missing debug
files=$(grep -r "vi.mock.*logger" --include="*.test.ts" src/ | grep -v "debug:" | cut -d: -f1 | sort -u)

for file in $files; do
  echo "Fixing: $file"
  
  # Replace logger mock with complete version
  sed -i 's/logger: {$/logger: {\n    debug: vi.fn(() => {}),/g' "$file"
  
  # Also handle cases where it's all on one line
  sed -i 's/logger: { info:/logger: { debug: vi.fn(() => {}), info:/g' "$file"
done

echo "Fixed $(echo "$files" | wc -l) files"