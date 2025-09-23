# RSOLV Pattern Tiers

RSOLV uses a tiered pattern system to provide different levels of security analysis based on your subscription level.

## Pattern Tiers Overview

### Public Tier (Free)
- **6 basic patterns** per language
- Common vulnerabilities like SQL injection and XSS
- Basic OWASP Top 10 coverage
- Good for evaluation and small projects

### Professional Tier  
- **78 patterns** across all languages
- Extended OWASP Top 10 coverage
- Framework-specific patterns
- Advanced vulnerability detection

### Enterprise Tier
- **448+ patterns** including:
  - All professional patterns
  - CVE-specific patterns (Log4Shell, Spring4Shell, etc.)
  - Advanced semantic patterns
  - Custom pattern support
  - Zero-day vulnerability patterns

## Pattern Coverage by Language

### JavaScript/TypeScript
- **Public**: 6 patterns (SQL injection, XSS, open redirect)
- **Professional**: 27 patterns (+ prototype pollution, SSRF, path traversal)
- **Enterprise**: 123 patterns (+ React/Vue/Angular specific, npm vulnerabilities)

### Python
- **Public**: 6 patterns (SQL injection, command injection, XXE)
- **Professional**: 12 patterns (+ pickle deserialization, YAML vulnerabilities)
- **Enterprise**: 89 patterns (+ Django/Flask specific, type confusion)

### Ruby
- **Public**: 6 patterns (SQL injection, mass assignment, XSS)
- **Professional**: 20 patterns (+ YAML deserialization, regex DoS)
- **Enterprise**: 72 patterns (+ Rails specific, metaprogramming vulnerabilities)

### Java
- **Public**: 6 patterns (SQL injection, XXE, path traversal)
- **Professional**: 17 patterns (+ deserialization, LDAP injection)
- **Enterprise**: 64 patterns (+ Spring specific, JNDI injection, Log4Shell)

### PHP
- **Public**: 6 patterns (SQL injection, file inclusion, XSS)
- **Professional**: 25 patterns (+ object injection, type juggling)
- **Enterprise**: 50+ patterns (+ WordPress/Laravel specific)

### Elixir
- **Public**: 6 patterns (SQL injection, atom exhaustion, XSS)
- **Professional**: 22 patterns (+ process vulnerabilities, ETS exposure)
- **Enterprise**: 28 patterns (+ Phoenix/OTP specific)

## API Key Format

Your API key determines your pattern access:

```
rsolv_public_[random]    - Public tier (6 patterns)
rsolv_pro_[random]       - Professional tier (78 patterns)
rsolv_enterprise_[random] - Enterprise tier (448+ patterns)
```

## Pattern Updates

- **Public**: Updated quarterly
- **Professional**: Updated monthly
- **Enterprise**: Real-time updates as new vulnerabilities discovered

## Checking Your Pattern Access

Run a scan and check the logs:

```
[INFO] Fetched 6 javascript patterns from API (tiers: public)
```

Or with professional access:

```
[INFO] Fetched 27 javascript patterns from API (tiers: public,professional)
```

## Pattern Examples

### Public Tier Pattern Example
```javascript
// SQL Injection Detection
patterns: [
  {
    id: 'js-sqli-001',
    regex: /query\s*\(\s*["'`].*\$\{.*\}.*["'`]\s*\)/,
    message: 'SQL query using template literals'
  }
]
```

### Professional Tier Pattern Example
```javascript
// Prototype Pollution Detection
patterns: [
  {
    id: 'js-proto-001',
    regex: /obj\[.*\]\s*=.*req\.(body|query|params)/,
    message: 'Potential prototype pollution via user input'
  }
]
```

### Enterprise Tier Pattern Example
```javascript
// React Specific XSS Detection
patterns: [
  {
    id: 'js-react-xss-001',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*[^}]*user/,
    message: 'User input in dangerouslySetInnerHTML'
  }
]
```

## Upgrading Your Access

To access more patterns:

1. Visit https://rsolv.dev/pricing
2. Choose your plan
3. Get your new API key
4. Update your GitHub secret

## Pattern Effectiveness

Based on real-world usage:

- **Public Tier**: Catches ~40% of common vulnerabilities
- **Professional Tier**: Catches ~75% of vulnerabilities
- **Enterprise Tier**: Catches ~95% of vulnerabilities

## Custom Patterns (Enterprise Only)

Enterprise customers can add custom patterns:

```yaml
# .github/rsolv-patterns.yml
customPatterns:
  - language: javascript
    id: custom-api-key
    pattern: 'API_KEY\s*=\s*["''][^"'']+["'']'
    severity: high
    message: "Hardcoded API key detected"
    fix: "Use environment variables for API keys"
```

## Support

- Pattern documentation: https://docs.rsolv.dev/patterns
- Request new patterns: patterns@rsolv.dev
- Report false positives: support@rsolv.dev