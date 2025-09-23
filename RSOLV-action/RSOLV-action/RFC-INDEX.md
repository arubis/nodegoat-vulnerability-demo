# RFC Index - RSOLV-action

## RFCs Moved to Project Level

All RFCs have been moved to the main project RFC directory for better organization and to resolve numbering conflicts.

**Location**: `/home/dylan/dev/rsolv/RFCs/`

## RFCs Created During Test Generation Implementation

The following RFCs were created during our test generation framework work and are now at the project level:

| Original # | New # | Title | Status | Created |
|------------|-------|-------|--------|---------|
| RFC-019 | [RFC-027](../RFCs/RFC-027-TERRAFORM-IAC-SECURITY.md) | Terraform/IaC Security Test Generation | Draft | 2025-06-24 |
| RFC-020 | [RFC-028](../RFCs/RFC-028-FIX-VALIDATION-INTEGRATION.md) | Fix Validation Integration | Implemented | 2025-06-24 |
| RFC-021 | [RFC-029](../RFCs/RFC-029-MULTI-LANGUAGE-AST-PARSING.md) | Multi-Language AST Parsing Architecture | Draft | 2025-06-24 |
| RFC-022 | [RFC-030](../RFCs/RFC-030-UNIVERSAL-TEST-FRAMEWORK-DETECTION.md) | Universal Test Framework Detection | Draft | 2025-06-24 |
| RFC-023 | [RFC-031](../RFCs/RFC-031-ELIXIR-AST-ANALYSIS-SERVICE.md) | Elixir-Powered AST Analysis Service | Draft | 2025-06-24 |

## Context

These RFCs were created during the implementation of the Test Generation Framework (v1.0.0):
- **RFC-027**: Addresses limited IaC support discovered during Phase 6D validation
- **RFC-028**: Ensures generated fixes pass tests before PR creation (already implemented)
- **RFC-029**: Solves the Babel limitation of JavaScript-only AST parsing
- **RFC-030**: Improves test framework detection using Claude Code SDK
- **RFC-031**: Proposes using Elixir backend for multi-language AST analysis

## RFC Process

1. **Draft**: Initial proposal and design
2. **Review**: Under review by team
3. **Accepted**: Approved for implementation
4. **Implemented**: Feature has been built
5. **Deprecated**: No longer relevant or superseded

## Creating New RFCs

When creating a new RFC:
1. Check this index for the next available number
2. Use the template: `RFC-XXX-DESCRIPTIVE-NAME.md`
3. Place in the `/RFCs` directory
4. Update this index immediately
5. Include standard RFC headers (Status, Created, Author, Summary)

## RFC Categories

### Architecture & Design
- RFC-020: Fix Validation Integration
- RFC-021: Multi-Language AST Parsing Architecture
- RFC-022: Universal Test Framework Detection
- RFC-023: Elixir-Powered AST Analysis Service

### Security Features
- RFC-008: Pattern Serving API (implemented)
- RFC-019: Terraform/IaC Security Test Generation

### Integration & APIs
- RFC-008: Pattern Serving API

## Next Steps

1. ~~Rename `RFC-021-UNIVERSAL-TEST-FRAMEWORK-DETECTION.md` to `RFC-022-UNIVERSAL-TEST-FRAMEWORK-DETECTION.md`~~ ✅
2. ~~Create RFC-019 for Terraform/IaC Security Coverage (Phase 7)~~ ✅
3. Document RFC-003 if still relevant
4. Consider documenting RFC-008 formally if not already present in git history
5. Implement RFC-023 after completing current vulnerability detection improvements
6. Implement RFC-019 patterns and test generation for IaC