# RSOLV-action Pattern Field Analysis

## Summary

The RSOLV-action code is designed to handle multiple pattern field formats from the API. The `PatternAPIClient.convertToSecurityPattern()` method (lines 195-286 in pattern-api-client.ts) handles the following field variations:

## Field Names Supported

1. **`regex`** (enhanced format) - Can be string or string[]
2. **`regex_patterns`** - Array of strings (current API format)
3. **`patterns`** - Can be:
   - Array of strings (legacy language endpoint format)
   - Object with `regex` property containing array (legacy tier endpoint format)

## Processing Order

The code checks for fields in this specific order:
1. First checks for `regex` field (enhanced format)
2. Then checks for `regex_patterns` field (current API format)
3. Then checks if `patterns` is an array
4. Finally checks if `patterns` is an object with a `regex` property

## Current Implementation

The `convertToSecurityPattern` method in `pattern-api-client.ts`:
- Gracefully handles all these variations
- Converts string patterns to RegExp objects
- Logs a warning only if NO pattern data is found in any format
- Maps to internal `SecurityPattern` type which expects `patterns.regex` as RegExp[]

## Usage in Detectors

- `detector-v2.ts` accesses patterns via `pattern.patterns.regex`
- AST patterns are identified by the presence of `pattern.astRules`
- The pattern source abstraction (`pattern-source.ts`) fetches patterns through the API client

## Recommendation

The RSOLV-action code is already handling the field name inconsistencies correctly. The flexible field checking ensures compatibility with:
- Legacy API responses using `patterns` field
- Current API responses using `regex_patterns` 
- Enhanced format using `regex` field

No changes are needed to RSOLV-action as it already handles all field variations appropriately.