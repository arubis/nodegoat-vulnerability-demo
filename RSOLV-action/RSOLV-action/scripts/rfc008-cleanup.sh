#!/bin/bash
# RFC-008 Pattern Cleanup Script
# This script removes pattern files and updates the codebase to use only API patterns

echo "RFC-008 Pattern Cleanup - Protecting IP by removing hardcoded patterns"
echo "======================================================================"

# 1. Remove pattern files
echo "Step 1: Removing pattern files..."
rm -rf src/security/patterns/
echo "✓ Removed src/security/patterns/ directory"

# 2. Remove old pattern system files
echo "Step 2: Removing old pattern system..."
rm -f src/security/patterns.ts
rm -f src/security/__tests__/patterns.test.ts
echo "✓ Removed old pattern registry files"

# 3. Remove old detector and pattern source files
echo "Step 3: Removing old detector and pattern source..."
rm -f src/security/detector.ts
rm -f src/security/__tests__/detector.test.ts
rm -f src/security/tiered-pattern-source.ts
echo "✓ Removed old detector and pattern source files"

# 4. Remove test files that depend on patterns
echo "Step 4: Removing pattern-dependent test files..."
rm -f src/security/__tests__/ruby-security-integration.test.ts
rm -f src/security/__tests__/security-workflow-e2e.test.ts
rm -f src/__tests__/rfc008-integration.test.ts
echo "✓ Removed pattern-dependent tests"

# 5. Remove demo file that uses old detector
echo "Step 5: Removing old demo file..."
rm -f src/security-demo.ts
echo "✓ Removed security-demo.ts"

echo ""
echo "Cleanup complete! Next steps:"
echo "1. Update src/security/index.ts to export SecurityDetectorV2 instead of old components"
echo "2. Run tests to ensure everything works with minimal patterns"
echo "3. Commit changes"
echo "4. Consider creating a new demo file using SecurityDetectorV2"