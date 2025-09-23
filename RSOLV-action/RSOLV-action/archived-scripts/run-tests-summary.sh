#!/bin/bash
echo "Running RSOLV-action test suite..."
timeout 60 bun test 2>&1 | grep -E "^\s*[0-9]+ pass|^\s*[0-9]+ fail|^Ran [0-9]+ tests" | tail -5