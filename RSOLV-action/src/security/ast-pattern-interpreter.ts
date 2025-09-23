#!/usr/bin/env bun
/**
 * AST Pattern Interpreter for RSOLV-action
 * 
 * Interprets AST-enhanced patterns from RSOLV-api to dramatically
 * reduce false positives without sending code to the server.
 */

import { parse } from '@babel/parser';
import * as traverse from '@babel/traverse';
import * as t from '@babel/types';

import { SecurityPattern } from './types.js';

// Extend SecurityPattern type for internal use
interface ASTPattern extends SecurityPattern {
  // Map SecurityPattern fields to expected format
  regex?: string;
  ast_rules?: any;
  context_rules?: any;
  confidence_rules?: any;
  min_confidence?: number;
}

interface Finding {
  pattern: SecurityPattern;
  file: string;
  line: number;
  column: number;
  code: string;
  confidence: number;
}

export class ASTPatternInterpreter {
  /**
   * Scan a file using both regex pre-filtering and AST analysis.
   */
  async scanFile(filePath: string, content: string, patterns: SecurityPattern[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Skip test files globally
    if (this.isTestFile(filePath)) {
      return [];
    }
    
    console.log(`[AST] Scanning file: ${filePath}`);
    console.log(`[AST] Total patterns: ${patterns.length}`);
    
    // Phase 1: Regex pre-filter (FAST!)
    const candidatePatterns = patterns.filter(pattern => {
      // Check if pattern has regex patterns to test
      if (pattern.patterns?.regex && pattern.patterns.regex.length > 0) {
        // Test each regex pattern
        const matched = pattern.patterns.regex.some(regex => regex.test(content));
        if (matched) {
          console.log(`[AST] Pattern ${pattern.id} matched via regex`);
        }
        return matched;
      }
      return false;
    });
    
    console.log(`[AST] Candidate patterns after regex filter: ${candidatePatterns.length}`);
    
    if (candidatePatterns.length === 0) {
      return findings;
    }
    
    // Check if this is a JavaScript/TypeScript file
    const isJavaScriptFile = this.isJavaScriptFile(filePath);
    
    // Phase 2: AST analysis for JavaScript/TypeScript files only
    if (isJavaScriptFile) {
      let ast;
      try {
        ast = parse(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
          errorRecovery: true
        });
      } catch (error) {
        // Fall back to regex-only for unparseable files
        return this.regexOnlyFallback(filePath, content, candidatePatterns);
      }
    
      // Apply each candidate pattern
      for (const pattern of candidatePatterns) {
        if (pattern.astRules) {
          console.log(`[AST] Applying AST rules for pattern ${pattern.id}`);
          const patternFindings = this.applyASTPattern(ast, pattern, filePath, content);
          console.log(`[AST] Found ${patternFindings.length} issues with AST rules`);
          findings.push(...patternFindings);
        } else {
          // Pattern doesn't have AST rules, use regex
          console.log(`[AST] Pattern ${pattern.id} has no AST rules, using regex`);
          const regexFindings = this.applyRegexPattern(content, pattern, filePath);
          findings.push(...regexFindings);
        }
      }
    } else {
      // For non-JavaScript files, use regex-only approach
      return this.regexOnlyFallback(filePath, content, candidatePatterns);
    }
    
    // Filter by minimum confidence
    return findings.filter(f => 
      f.confidence >= (f.pattern.minConfidence || 0.7)
    );
  }
  
  private applyASTPattern(ast: any, pattern: SecurityPattern, filePath: string, content: string): Finding[] {
    const findings: Finding[] = [];
    const rules = pattern.astRules!;
    
    const self = this; // Capture this context
    
    (traverse as any).default(ast, {
      enter(path: any) {
        // Check node type if specified
        if (rules.node_type && path.node.type !== rules.node_type) {
          return;
        }
        
        // Apply pattern-specific logic
        let matches = false;
        let confidence = pattern.confidenceRules?.base || 0.8;
        
        // Convert VulnerabilityType enum to string for switch
        const patternType = pattern.type.toLowerCase().replace(/_/g, ' ');
        
        switch (patternType) {
          case 'sql injection':
            matches = self.checkSQLInjection(path, rules, pattern);
            break;
          case 'logging':
            matches = self.checkMissingLogging(path, rules, pattern);
            break;
          case 'nosql injection':
            matches = self.checkNoSQLInjection(path, rules, pattern);
            break;
          default:
            matches = self.checkGenericPattern(path, rules, pattern);
        }
        
        if (matches) {
          // Calculate confidence adjustments
          confidence = self.calculateConfidence(
            path, 
            confidence, 
            pattern.confidenceRules?.adjustments || {}
          );
          
          
          const loc = path.node.loc;
          if (loc) {
            findings.push({
              pattern,
              file: filePath,
              line: loc.start.line,
              column: loc.start.column,
              code: content.substring(path.node.start || 0, path.node.end || 0),
              confidence
            });
          }
        }
      }
    });
    
    return findings;
  }
  
  private checkSQLInjection(path: any, rules: any, pattern: SecurityPattern): boolean {
    const node = path.node;
    
    // Handle BinaryExpression (string concatenation with +)
    if (t.isBinaryExpression(node) && node.operator === '+') {
      // Check if this is building a SQL query
      const fullExpression = this.getFullConcatenatedString(path);
      const hasSQL = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(fullExpression);
      
      console.log(`[AST] SQL check: BinaryExpression found, hasSQL=${hasSQL}, expression="${fullExpression}"`);
      
      if (hasSQL) {
        // Check if in database call
        const inDbCall = this.isInDatabaseCall(path);
        
        // Check for user input in concatenation
        const hasUserInput = this.hasConcatenatedUserInput(path);
        
        // Also check if this concatenation is assigned to a variable that's used in a DB call
        const isQueryVariable = this.isAssignedToQueryVariable(path);
        
        if ((inDbCall || isQueryVariable) && hasUserInput) {
          // Check exclusion rules
          if (pattern.contextRules?.exclude_if_parameterized) {
            const isParameterized = this.isParameterizedQuery(path);
            if (isParameterized) return false;
          }
          
          if (pattern.contextRules?.exclude_if_logging_only) {
            const isOnlyUsedForLogging = this.isOnlyUsedForLogging(path);
            if (isOnlyUsedForLogging) return false;
          }
          
          return true;
        }
      }
    }
    
    // Also check template literals
    if (t.isTemplateLiteral(node)) {
      const hasSQL = node.quasis.some((q: any) => 
        /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(q.value.raw)
      );
      const hasUserInput = node.expressions.some((expr: any) =>
        this.containsUserInput(expr, path)
      );
      
      if (hasSQL && hasUserInput) {
        // Check if parameterized
        if (pattern.contextRules?.exclude_if_parameterized) {
          const isParameterized = this.isParameterizedQuery(path);
          if (isParameterized) return false;
        }
        return true;
      }
    }
    
    return false;
  }
  
  private checkMissingLogging(path: any, rules: any, pattern: SecurityPattern): boolean {
    const node = path.node;
    
    // Must be a function declaration
    if (!t.isFunctionDeclaration(node)) return false;
    
    // Check function name
    if (rules.name_matches && node.id) {
      const nameRegex = new RegExp(rules.name_matches);
      if (!nameRegex.test(node.id.name)) return false;
      
      // Check if body contains logging
      const bodyString = this.getBodyString(node);
      const excludeRegex = new RegExp(rules.body_excludes || 'log|logger');
      
      if (excludeRegex.test(bodyString)) return false;
      
      // Check if it delegates
      if (pattern.contextRules?.exclude_if_delegates) {
        if (this.delegatesToOtherFunction(node)) return false;
      }
      
      return true;
    }
    
    return false;
  }
  
  private checkNoSQLInjection(path: any, rules: any, pattern: SecurityPattern): boolean {
    const node = path.node;
    
    if (!t.isCallExpression(node)) return false;
    
    // Check method name
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const methodName = node.callee.property.name;
      if (!rules.method_names?.includes(methodName)) return false;
      
      // Check arguments for user input
      const firstArg = node.arguments[0];
      if (t.isObjectExpression(firstArg)) {
        // Check for dangerous operators
        const hasDangerousOp = firstArg.properties.some((prop: any) =>
          t.isObjectProperty(prop) && 
          t.isIdentifier(prop.key) &&
          rules.argument_contains?.dangerous_keys?.includes(prop.key.name)
        );
        
        if (hasDangerousOp) return true;
        
        // Check for user input
        const hasUserInput = firstArg.properties.some((prop: any) =>
          this.containsUserInput(prop.value, path)
        );
        
        return hasUserInput;
      }
    }
    
    return false;
  }
  
  private checkGenericPattern(path: any, rules: any, pattern: SecurityPattern): boolean {
    // Generic pattern matching logic
    return false;
  }
  
  // Helper methods
  
  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /\/__tests__\//,
      /\/test\//,
      /\/spec\//
    ];
    return testPatterns.some(p => p.test(filePath));
  }
  
  private isJavaScriptFile(filePath: string): boolean {
    // Check if this is a JavaScript or TypeScript file
    const jsPatterns = [
      /\.[jt]sx?$/,  // .js, .jsx, .ts, .tsx
      /\.mjs$/,      // ES modules
      /\.cjs$/       // CommonJS modules
    ];
    return jsPatterns.some(p => p.test(filePath));
  }
  
  private isInDatabaseCall(path: any): boolean {
    // Use path traversal to look up the tree properly
    let current = path;
    let depth = 0;
    
    while (current && depth < 10) {
      const parentPath = current.parentPath;
      if (!parentPath) break;
      
      const parentNode = parentPath.node;
      
      if (t.isCallExpression(parentNode)) {
        if (t.isMemberExpression(parentNode.callee)) {
          const prop = parentNode.callee.property;
          if (t.isIdentifier(prop) && 
              ['query', 'execute', 'exec', 'run', 'all', 'get'].includes(prop.name)) {
            return true;
          }
        }
      }
      
      current = parentPath;
      depth++;
    }
    
    return false;
  }
  
  private containsUserInput(node: any, path: any): boolean {
    if (!node) return false;
    
    if (t.isMemberExpression(node)) {
      const objName = this.getObjectName(node);
      return ['req', 'request', 'params', 'query', 'body'].includes(objName);
    }
    
    if (t.isIdentifier(node)) {
      const binding = path.scope.getBinding(node.name);
      if (binding && binding.path.isVariableDeclarator()) {
        return this.containsUserInput(binding.path.node.init, binding.path);
      }
    }
    
    return false;
  }
  
  private getObjectName(node: any): string {
    if (t.isMemberExpression(node) && t.isIdentifier(node.object)) {
      return node.object.name;
    }
    return '';
  }
  
  private isParameterizedQuery(path: any): boolean {
    const parent = path.parent;
    if (t.isCallExpression(parent)) {
      // Check if using ? placeholders or array of params
      return parent.arguments.length > 1 || 
             (t.isTemplateLiteral(parent.arguments[0]) && 
              parent.arguments[0].quasis.some((q: any) => q.value.raw.includes('?')));
    }
    return false;
  }
  
  private getBodyString(node: any): string {
    if (node.body && node.body.body) {
      return node.body.body.map((n: any) => n.type).join(' ');
    }
    return '';
  }
  
  private delegatesToOtherFunction(node: any): boolean {
    if (node.body && node.body.body) {
      return node.body.body.some((stmt: any) =>
        t.isReturnStatement(stmt) && 
        t.isCallExpression(stmt.argument)
      );
    }
    return false;
  }
  
  private calculateConfidence(
    path: any, 
    baseConfidence: number, 
    adjustments: Record<string, number>
  ): number {
    let confidence = baseConfidence;
    
    // Apply adjustments based on context
    // SQL injection specific adjustments
    if (adjustments.direct_req_param_concat && this.hasConcatenatedUserInput(path)) {
      confidence += adjustments.direct_req_param_concat;
    }
    
    if (adjustments.within_db_query_call && (this.isInDatabaseCall(path) || this.isAssignedToQueryVariable(path))) {
      confidence += adjustments.within_db_query_call;
    }
    
    if (adjustments.has_sql_keywords) {
      const node = path.node;
      if (t.isBinaryExpression(node)) {
        const fullExpression = this.getFullConcatenatedString(path);
        if (/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(fullExpression)) {
          confidence += adjustments.has_sql_keywords;
        }
      }
    }
    
    // Check for console.log and apply massive negative adjustment
    if (adjustments.is_console_log && this.isInConsoleLog(path)) {
      confidence += adjustments.is_console_log; // This should be -1.0
    }
    
    // Generic adjustments
    if (adjustments.direct_user_input && this.hasDirectUserInput(path)) {
      confidence += adjustments.direct_user_input;
    }
    
    if (adjustments.has_validation && this.hasValidation(path)) {
      confidence += adjustments.has_validation;
    }
    
    if (adjustments.is_test_code && this.isInTestCode(path)) {
      confidence += adjustments.is_test_code;
    }
    
    if (adjustments.in_test_file && this.isTestFile(path.hub?.file?.opts?.filename || '')) {
      confidence += adjustments.in_test_file;
    }
    
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }
  
  private hasDirectUserInput(path: any): boolean {
    // Check if user input is used directly without any transformation
    return false; // Simplified for demo
  }
  
  private hasValidation(path: any): boolean {
    // Check if input goes through validation
    return false; // Simplified for demo
  }
  
  private isInTestCode(path: any): boolean {
    // Check if we're in test code
    return false; // Simplified for demo
  }
  
  private getFullConcatenatedString(path: any): string {
    // Try to extract the full concatenated string for analysis
    const node = path.node;
    if (t.isBinaryExpression(node)) {
      const parts: string[] = [];
      
      // Get left side
      if (t.isStringLiteral(node.left)) {
        parts.push(node.left.value);
      }
      
      // Get right side (could be a variable)
      if (t.isStringLiteral(node.right)) {
        parts.push(node.right.value);
      } else if (t.isIdentifier(node.right)) {
        parts.push('USER_INPUT'); // Placeholder for analysis
      }
      
      return parts.join('');
    }
    return '';
  }
  
  private hasConcatenatedUserInput(path: any): boolean {
    const node = path.node;
    if (!t.isBinaryExpression(node)) return false;
    
    // Check if right side contains user input
    const right = node.right;
    
    // Direct identifier that might be user input
    if (t.isIdentifier(right)) {
      // Check if it's from req.params, req.query, etc.
      return true; // Simplified for now
    }
    
    // Member expression like req.params.id
    if (t.isMemberExpression(right)) {
      const obj = right.object;
      if (t.isMemberExpression(obj) && t.isIdentifier(obj.object)) {
        // Check for req.params, req.query, req.body
        if (obj.object.name === 'req') {
          const prop = obj.property;
          if (t.isIdentifier(prop) && 
              ['params', 'query', 'body'].includes(prop.name)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  private isAssignedToQueryVariable(path: any): boolean {
    // Check if this expression is assigned to a variable with 'query' in the name
    const parent = path.parent;
    
    if (t.isVariableDeclarator(parent) && parent.init === path.node) {
      if (t.isIdentifier(parent.id)) {
        const varName = parent.id.name.toLowerCase();
        return varName.includes('query') || varName.includes('sql');
      }
    }
    
    return false;
  }
  
  private isInConsoleLog(path: any): boolean {
    // Check if this expression is inside a console.log call
    let current = path;
    let depth = 0;
    
    while (current && depth < 5) {
      const parentPath = current.parentPath;
      if (!parentPath) break;
      
      const parentNode = parentPath.node;
      
      if (t.isCallExpression(parentNode)) {
        const callee = parentNode.callee;
        if (t.isMemberExpression(callee) && 
            t.isIdentifier(callee.object) && callee.object.name === 'console' &&
            t.isIdentifier(callee.property) && callee.property.name === 'log') {
          return true;
        }
      }
      
      current = parentPath;
      depth++;
    }
    
    return false;
  }
  
  private isOnlyUsedForLogging(path: any): boolean {
    // Check if this SQL string is only used for logging, not execution
    const parent = path.parent;
    
    // If it's assigned to a variable, check all its uses
    if (t.isVariableDeclarator(parent) && parent.init === path.node) {
      const varName = (parent.id as any).name;
      
      // Find the scope and check all references to this variable
      const binding = path.scope.getBinding(varName);
      if (!binding) return false;
      
      // Check all references - if ALL are console.log, it's safe
      const allForLogging = binding.referencePaths.every((refPath: any) => {
        return this.isInConsoleLog(refPath);
      });
      
      return allForLogging;
    }
    
    // If it's directly in console.log, it's only for logging
    return this.isInConsoleLog(path);
  }
  
  // Fallback methods
  
  private regexOnlyFallback(
    filePath: string, 
    content: string, 
    patterns: SecurityPattern[]
  ): Finding[] {
    // Use regex matching when AST parsing fails (e.g., for non-JavaScript languages)
    const findings: Finding[] = [];
    
    for (const pattern of patterns) {
      // Apply regex patterns regardless of whether pattern has AST rules
      // This ensures non-JavaScript code can still be analyzed
      const regexFindings = this.applyRegexPattern(content, pattern, filePath);
      findings.push(...regexFindings);
    }
    
    return findings;
  }
  
  private applyRegexPattern(
    content: string, 
    pattern: SecurityPattern, 
    filePath: string
  ): Finding[] {
    // Traditional regex matching for patterns without AST rules
    const findings: Finding[] = [];
    const lines = content.split('\n');
    
    if (!pattern.patterns?.regex) {
      return findings;
    }
    
    // Test each regex pattern
    for (const regex of pattern.patterns.regex) {
      let match;
      regex.lastIndex = 0; // Reset regex state
      
      while ((match = regex.exec(content)) !== null) {
        // Calculate line number
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const line = lines[lineNumber - 1];
        const column = match.index - content.lastIndexOf('\n', match.index - 1) - 1;
        
        findings.push({
          pattern,
          file: filePath,
          line: lineNumber,
          column: column,
          code: match[0],
          confidence: pattern.confidenceRules?.base || 0.8
        });
        
        // Prevent infinite loop on zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
    
    return findings;
  }
}

// Demo usage
// if (import.meta.main) {
//   console.log("AST Pattern Interpreter ready for integration!");
//   console.log("This dramatically reduces false positives by:");
//   console.log("1. Using AST to understand code structure");
//   console.log("2. Applying context rules (exclude test files, etc.)");
//   console.log("3. Dynamic confidence scoring");
//   console.log("4. Framework-aware detection");
// }