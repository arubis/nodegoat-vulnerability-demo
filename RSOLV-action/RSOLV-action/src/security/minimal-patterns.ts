import { SecurityPattern, VulnerabilityType } from './types.js';

/**
 * Get minimal patterns with fresh RegExp objects
 * This factory approach prevents regex serialization issues
 */
export function getMinimalPatterns(): SecurityPattern[] {
  return [
  // JavaScript/TypeScript patterns
  // Basic SQL Injection
  {
    id: 'basic-sql-injection',
    name: 'Basic SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'Potential SQL injection via string concatenation',
    patterns: {
      regex: [
        /["'`].*?(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*?["'`]\s*\+/gi,
        /execute\s*\(\s*['"`].*\+/gi
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use parameterized queries or prepared statements',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Basic XSS
  {
    id: 'basic-xss',
    name: 'Basic Cross-Site Scripting',
    type: VulnerabilityType.XSS,
    severity: 'high',
    description: 'Potential XSS via innerHTML',
    patterns: {
      regex: [
        /innerHTML\s*=\s*[^'"`;]*(userInput|userContent|req\.|request\.)/gi,
        /document\.write\s*\(/gi
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021',
    remediation: 'Use textContent or proper encoding',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Basic Command Injection
  {
    id: 'basic-command-injection',
    name: 'Basic Command Injection',
    type: VulnerabilityType.COMMAND_INJECTION,
    severity: 'critical',
    description: 'Potential command injection',
    patterns: {
      regex: [
        /exec\s*\(\s*['"`].*\+/gi,
        /system\s*\(\s*['"`].*\+/gi
      ]
    },
    languages: ['javascript', 'python', 'ruby'],
    cweId: 'CWE-78',
    owaspCategory: 'A03:2021',
    remediation: 'Validate and sanitize all user input',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Basic Path Traversal
  {
    id: 'basic-path-traversal',
    name: 'Basic Path Traversal',
    type: VulnerabilityType.PATH_TRAVERSAL,
    severity: 'high',
    description: 'Potential path traversal vulnerability',
    patterns: {
      regex: [
        /readFile\s*\([^)]*\.\.\/[^)]*\)/gi,
        /path\.join\s*\([^)]*req\./gi
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-22',
    owaspCategory: 'A01:2021',
    remediation: 'Validate and sanitize file paths',
    examples: { vulnerable: '', secure: '' }
  },
  
  // JavaScript eval pattern
  {
    id: 'js-eval',
    name: 'JavaScript Eval Usage',
    type: VulnerabilityType.COMMAND_INJECTION,
    severity: 'critical',
    description: 'Use of eval() function',
    patterns: {
      regex: [
        /eval\s*\(/gi,
        /Function\s*\(/gi,
        /setTimeout\s*\([^,]*,[^,)]*\)/gi
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-94',
    owaspCategory: 'A03:2021',
    remediation: 'Avoid eval(), use JSON.parse() or safer alternatives',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Python patterns
  {
    id: 'python-sql-injection',
    name: 'Python SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'SQL injection via string formatting or concatenation',
    patterns: {
      regex: [
        /\.raw\s*\(/gi,
        /execute\s*\(\s*["'].*%[s|d].*["']\s*%/gi,
        /execute\s*\(\s*["'].*\+.*["']\s*\)/gi,
        /cursor\.execute\s*\(\s*f["']/gi
      ]
    },
    languages: ['python'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use parameterized queries with ? or %s placeholders',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'python-eval',
    name: 'Python Eval Usage',
    type: VulnerabilityType.COMMAND_INJECTION,
    severity: 'critical',
    description: 'Use of eval() with user input',
    patterns: {
      regex: [
        /eval\s*\(/gi,
        /exec\s*\(/gi
      ]
    },
    languages: ['python'],
    cweId: 'CWE-94',
    owaspCategory: 'A03:2021',
    remediation: 'Avoid eval(), use ast.literal_eval() for safe evaluation',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'python-pickle',
    name: 'Insecure Deserialization',
    type: VulnerabilityType.INSECURE_DESERIALIZATION,
    severity: 'high',
    description: 'Use of pickle with untrusted data',
    patterns: {
      regex: [
        /pickle\.loads?\s*\(/gi,
        /cPickle\.loads?\s*\(/gi
      ]
    },
    languages: ['python'],
    cweId: 'CWE-502',
    owaspCategory: 'A08:2021',
    remediation: 'Use JSON or other safe serialization formats',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Ruby patterns
  {
    id: 'ruby-sql-injection',
    name: 'Ruby SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'SQL injection via string interpolation',
    patterns: {
      regex: [
        /\.where\s*\(\s*["'].*#\{.*\}.*["']/gi,
        /find_by_sql\s*\(\s*["'].*#\{.*\}.*["']/gi,
        /execute\s*\(\s*["'].*#\{.*\}.*["']/gi
      ]
    },
    languages: ['ruby'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use parameterized queries or ActiveRecord query interface',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'ruby-eval',
    name: 'Ruby Eval Usage',
    type: VulnerabilityType.COMMAND_INJECTION,
    severity: 'critical',
    description: 'Use of eval with user input',
    patterns: {
      regex: [
        /eval\s*\(/gi,
        /instance_eval\s*\(/gi
      ]
    },
    languages: ['ruby'],
    cweId: 'CWE-94',
    owaspCategory: 'A03:2021',
    remediation: 'Avoid eval, use safe alternatives',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'ruby-yaml',
    name: 'YAML Deserialization',
    type: VulnerabilityType.INSECURE_DESERIALIZATION,
    severity: 'high',
    description: 'Unsafe YAML loading',
    patterns: {
      regex: [
        /YAML\.load\s*\(/gi,
        /Psych\.load\s*\(/gi
      ]
    },
    languages: ['ruby'],
    cweId: 'CWE-502',
    owaspCategory: 'A08:2021',
    remediation: 'Use YAML.safe_load instead',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Java patterns
  {
    id: 'java-sql-injection',
    name: 'Java SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'SQL injection via string concatenation',
    patterns: {
      regex: [
        // Direct concatenation in execute methods
        /\.?execute(?:Query|Update)?\s*\([^)]*\+[^)]*\)/gi,
        // Variable assignment with SQL + concatenation
        /String\s+\w*(?:query|sql|statement)\w*\s*=\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*["']\s*\+/gi,
        // Any SQL keyword in string followed by concatenation
        /["'].*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|FROM|WHERE|JOIN|UNION|ORDER BY|GROUP BY).*["']\s*\+/gi,
        // StringBuilder/StringBuffer with SQL
        /(?:StringBuilder|StringBuffer)\s*\(?\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE).*["']\s*\)?.*\.append\s*\(/gi,
        // String.format with SQL (potential for injection)
        /String\.format\s*\(\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE).*%[sd].*["']/gi,
        // PreparedStatement with concatenation (defeats the purpose)
        /prepareStatement\s*\([^)]*\+[^)]*\)/gi,
        // JDBC template with concatenation
        /jdbcTemplate\.(?:query|update|execute)\s*\([^)]*\+[^)]*\)/gi
      ]
    },
    languages: ['java'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use PreparedStatement with parameters',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'java-xxe',
    name: 'XML External Entity',
    type: VulnerabilityType.XML_EXTERNAL_ENTITIES,
    severity: 'high',
    description: 'XML parser vulnerable to XXE',
    patterns: {
      regex: [
        /DocumentBuilderFactory\.newInstance\s*\(\s*\)/gi,
        /SAXParserFactory\.newInstance\s*\(\s*\)/gi
      ]
    },
    languages: ['java'],
    cweId: 'CWE-611',
    owaspCategory: 'A05:2021',
    remediation: 'Disable external entities and DTD processing',
    examples: { vulnerable: '', secure: '' }
  },
  
  // PHP patterns
  {
    id: 'php-sql-injection',
    name: 'PHP SQL Injection',
    type: VulnerabilityType.SQL_INJECTION,
    severity: 'high',
    description: 'SQL injection via string concatenation or interpolation',
    patterns: {
      regex: [
        // Variable interpolation in SQL strings (matches $id, $user, etc inside SQL)
        /["'].*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)[^"']*\$\w+/gi,
        // Superglobal interpolation ($_GET, $_POST, $_REQUEST)
        /["'].*(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*\$(?:_GET|_POST|_REQUEST)\[/gi,
        // Concatenation with user input
        /["'].*(?:SELECT|INSERT|UPDATE|DELETE).*["']\s*\.\s*\$(?:_GET|_POST|_REQUEST)/gi,
        // mysql_query with concatenation
        /mysql_query\s*\([^)]*\.\s*\$/gi,
        // mysqli query with concatenation
        /mysqli_query\s*\([^,)]*,[^)]*\.\s*\$/gi,
        // PDO exec with concatenation
        /->exec\s*\([^)]*\.\s*\$/gi,
        // Variable assignment with SQL + user input
        /\$(?:query|sql)\s*=\s*["'].*(?:SELECT|INSERT|UPDATE|DELETE).*["']\s*\.\s*\$/gi,
        // Curly brace interpolation with superglobals
        /["'].*(?:SELECT|INSERT|UPDATE|DELETE).*\{\$(?:_GET|_POST|_REQUEST)/gi
      ]
    },
    languages: ['php'],
    cweId: 'CWE-89',
    owaspCategory: 'A03:2021',
    remediation: 'Use prepared statements with PDO or mysqli',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'php-eval',
    name: 'PHP Eval Usage',
    type: VulnerabilityType.COMMAND_INJECTION,
    severity: 'critical',
    description: 'Use of eval() function',
    patterns: {
      regex: [
        /eval\s*\(/gi,
        /assert\s*\(/gi
      ]
    },
    languages: ['php'],
    cweId: 'CWE-94',
    owaspCategory: 'A03:2021',
    remediation: 'Avoid eval(), use safe alternatives',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'php-file-inclusion',
    name: 'File Inclusion',
    type: VulnerabilityType.PATH_TRAVERSAL,
    severity: 'high',
    description: 'Dynamic file inclusion',
    patterns: {
      regex: [
        /include\s*\(\s*\$_(?:GET|POST|REQUEST)/gi,
        /require\s*\(\s*\$_(?:GET|POST|REQUEST)/gi
      ]
    },
    languages: ['php'],
    cweId: 'CWE-98',
    owaspCategory: 'A03:2021',
    remediation: 'Validate and whitelist file paths',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Elixir patterns
  {
    id: 'elixir-code-eval',
    name: 'Elixir Code Evaluation',
    type: VulnerabilityType.COMMAND_INJECTION,
    severity: 'critical',
    description: 'Dynamic code evaluation',
    patterns: {
      regex: [
        /Code\.eval_string\s*\(/gi,
        /Code\.eval_quoted\s*\(/gi
      ]
    },
    languages: ['elixir'],
    cweId: 'CWE-94',
    owaspCategory: 'A03:2021',
    remediation: 'Avoid dynamic code evaluation',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'elixir-atom-dos',
    name: 'Atom DoS',
    type: VulnerabilityType.DENIAL_OF_SERVICE,
    severity: 'medium',
    description: 'Creating atoms from user input',
    patterns: {
      regex: [
        /String\.to_atom\s*\(/gi,
        /binary_to_atom\s*\(/gi
      ]
    },
    languages: ['elixir'],
    cweId: 'CWE-400',
    owaspCategory: 'A06:2021',
    remediation: 'Use String.to_existing_atom instead',
    examples: { vulnerable: '', secure: '' }
  },
  
  // Cross-language patterns
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded Secret',
    type: VulnerabilityType.HARDCODED_SECRETS,
    severity: 'high',
    description: 'Hardcoded password or API key',
    patterns: {
      regex: [
        /password\s*=\s*["'][^"']{8,}["']/gi,
        /api_key\s*=\s*["'][^"']{20,}["']/gi
      ]
    },
    languages: ['javascript', 'typescript', 'python', 'ruby', 'java', 'php', 'elixir'],
    cweId: 'CWE-798',
    owaspCategory: 'A07:2021',
    remediation: 'Use environment variables or secure key management',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'weak-crypto',
    name: 'Weak Cryptography',
    type: VulnerabilityType.WEAK_CRYPTOGRAPHY,
    severity: 'medium',
    description: 'Use of weak cryptographic algorithms',
    patterns: {
      regex: [
        /MD5\s*\(/gi,
        /SHA1\s*\(/gi
      ]
    },
    languages: ['javascript', 'typescript', 'python', 'ruby', 'java', 'php'],
    cweId: 'CWE-327',
    owaspCategory: 'A02:2021',
    remediation: 'Use SHA-256 or stronger algorithms',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'jwt-none-algorithm',
    name: 'JWT None Algorithm',
    type: VulnerabilityType.BROKEN_AUTHENTICATION,
    severity: 'critical',
    description: 'JWT allowing none algorithm',
    patterns: {
      regex: [
        /algorithm\s*:\s*["']none["']/gi,
        /verify\s*:\s*false/gi
      ]
    },
    languages: ['javascript', 'typescript', 'python', 'ruby'],
    cweId: 'CWE-347',
    owaspCategory: 'A02:2021',
    remediation: 'Always verify JWT signatures',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'open-redirect',
    name: 'Open Redirect',
    type: VulnerabilityType.OPEN_REDIRECT,
    severity: 'medium',
    description: 'Unvalidated redirect',
    patterns: {
      regex: [
        /redirect\s*\(\s*req\./gi,
        /location\.href\s*=\s*req\./gi
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-601',
    owaspCategory: 'A03:2021',
    remediation: 'Validate redirect URLs against whitelist',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'nosql-injection',
    name: 'NoSQL Injection',
    type: VulnerabilityType.NOSQL_INJECTION,
    severity: 'high',
    description: 'MongoDB injection vulnerability',
    patterns: {
      regex: [
        /\$where\s*:/gi,
        /find\s*\(\s*{[^}]*\$ne\s*:/gi
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-943',
    owaspCategory: 'A03:2021',
    remediation: 'Sanitize user input and use parameterized queries',
    examples: { vulnerable: '', secure: '' }
  },
  
  {
    id: 'log4j-jndi',
    name: 'Log4j JNDI Injection (CVE-2021-44228)',
    type: VulnerabilityType.VULNERABLE_COMPONENTS,
    severity: 'critical',
    description: 'Log4Shell vulnerability pattern',
    patterns: {
      regex: [
        /\$\{jndi:/gi,
        /logger\.(?:info|warn|error|debug)\s*\([^)]*\$\{/gi
      ]
    },
    languages: ['java'],
    cweId: 'CWE-502',
    owaspCategory: 'A08:2021',
    remediation: 'Update Log4j to version 2.17.0 or later',
    examples: { vulnerable: '', secure: '' }
  },

  // Log Injection
  {
    id: 'log-injection-console',
    name: 'Log Injection via User Input',
    type: VulnerabilityType.LOG_INJECTION,
    severity: 'medium',
    description: 'User input is logged without sanitization, potentially allowing log forging attacks',
    patterns: {
      regex: [
        // console.log/error/warn with concatenation or template literal containing req/request
        /console\.(log|error|warn|info)\s*\([^)]*[\+`][^)]*\b(req|request|params|query|body|headers)\b/i,
        // logger methods with user input
        /logger\.(info|error|warn|debug|trace)\s*\([^)]*[\+`][^)]*\b(req|request|params|query|body|headers)\b/i,
        // winston logging with user input
        /winston\.(log|info|error|warn)\s*\([^)]*[\+`][^)]*\b(req|request|params|query|body|headers)\b/i,
        // process.stdout/stderr.write with user input
        /process\.(stdout|stderr)\.write\s*\([^)]*[\+`][^)]*\b(req|request|params|query|body|headers)\b/i,
        // fs.appendFile for logging with user input
        /fs\.(appendFile|appendFileSync)\s*\([^,]*log[^,]*,[^)]*[\+`][^)]*\b(req|request|params|query|body|headers)\b/i
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-117',
    owaspCategory: 'A09:2021',
    remediation: 'Sanitize user input before logging. Remove or encode newline characters and control sequences.',
    examples: {
      vulnerable: 'console.log("User: " + req.query.username)',
      secure: 'console.log("User:", sanitizeForLog(req.query.username))'
    }
  },

  // CRLF Injection
  {
    id: 'crlf-injection-headers',
    name: 'CRLF Injection in HTTP Headers',
    type: VulnerabilityType.CRLF_INJECTION,
    severity: 'high',
    description: 'User input is used in HTTP headers without sanitization, potentially allowing header injection',
    patterns: {
      regex: [
        // setHeader with user input
        /\.setHeader\s*\([^,]+,[^)]*\b(req|request|params|query|body|headers)\b/i,
        // writeHead with user input
        /\.writeHead\s*\([^,]+,\s*\{[^}]*\b(req|request|params|query|body|headers)\b/i,
        // Express res.set/header with user input
        /res\.(set|header)\s*\([^,]+,[^)]*\b(req|request|params|query|body|headers)\b/i,
        // res.write with user input (potential for header injection if headers not sent)
        /res\.write\s*\([^)]*[\+`][^)]*\b(req|request|params|query|body|headers)\b/i,
        // Cookie setting with user input
        /Set-Cookie['"]\s*,[^)]*[\+`][^)]*\b(req|request|params|query|body)\b/i,
        // decodeURIComponent on user input used in headers (can decode %0d%0a)
        /\.setHeader\s*\([^,]+,[^)]*decodeURIComponent\s*\([^)]*\b(req|request|params|query)\b/i
      ]
    },
    languages: ['javascript', 'typescript'],
    cweId: 'CWE-93',
    owaspCategory: 'A03:2021',
    remediation: 'Validate and sanitize all user input used in HTTP headers. Remove or encode CR (\\r) and LF (\\n) characters.',
    examples: {
      vulnerable: 'res.setHeader("X-User", req.query.username)',
      secure: 'res.setHeader("X-User", sanitizeHeaderValue(req.query.username))'
    }
  }
  ];
}

/**
 * Get minimal patterns for a specific language
 * Creates fresh RegExp objects to avoid serialization issues
 */
export function getMinimalPatternsByLanguage(language: string): SecurityPattern[] {
  const normalizedLang = language.toLowerCase();
  const allPatterns = getMinimalPatterns();
  return allPatterns.filter(p => 
    p.languages.includes(normalizedLang) || 
    (normalizedLang === 'typescript' && p.languages.includes('javascript'))
  );
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use getMinimalPatterns() instead to avoid regex serialization issues
 */
export const minimalFallbackPatterns = getMinimalPatterns();