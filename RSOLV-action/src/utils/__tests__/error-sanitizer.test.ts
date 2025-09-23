import { describe, test, expect, vi } from 'vitest';
import { sanitizeErrorMessage, sanitizeError } from '../error-sanitizer.js';

describe('Error Sanitizer', () => {
  describe('sanitizeErrorMessage', () => {
    test('should remove Anthropic references', () => {
      const messages = [
        'Failed to connect to Anthropic API',
        'Error: anthropic request failed',
        'ANTHROPIC_API_KEY is missing',
        'Using Claude-3 model'
      ];
      
      for (const message of messages) {
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).not.toContain('Anthropic');
        expect(sanitized).not.toContain('anthropic');
        expect(sanitized).not.toContain('ANTHROPIC');
        expect(sanitized).not.toContain('Claude');
        expect(sanitized).not.toContain('claude');
      }
    });

    test('should remove OpenAI references', () => {
      const messages = [
        'OpenAI API error',
        'Failed to connect to openai.com',
        'GPT-4 model not available',
        'OPENAI_API_KEY required'
      ];
      
      for (const message of messages) {
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).not.toContain('OpenAI');
        expect(sanitized).not.toContain('openai');
        expect(sanitized).not.toContain('GPT');
        expect(sanitized).not.toContain('gpt');
      }
    });

    test('should sanitize API URLs', () => {
      const messages = [
        'Failed to connect to https://api.anthropic.com/v1/messages',
        'Error from https://api.openai.com/chat/completions',
        'Request to https://api.mistral.ai/v1/chat failed'
      ];
      
      for (const message of messages) {
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).not.toContain('api.anthropic.com');
        expect(sanitized).not.toContain('api.openai.com');
        expect(sanitized).not.toContain('api.mistral.ai');
        expect(sanitized).toContain('API endpoint');
      }
    });

    test('should sanitize API keys and credentials', () => {
      const testCases = [
        {
          input: 'API key sk-proj-1234567890abcdef is invalid',
          shouldNotContain: /sk-proj-[a-zA-Z0-9]+/,
          shouldContain: 'API credential'
        },
        {
          input: 'Missing api_key: ant_1234567890',
          shouldNotContain: /ant_[a-zA-Z0-9]+/,
          shouldContain: 'API credential'
        },
        {
          input: 'Invalid token: eyJhbGciOiJIUzI1NiIs',
          shouldNotContain: /eyJ[a-zA-Z0-9]+/,
          shouldContain: 'token: [REDACTED]'
        },
        {
          input: 'Credential test-secret-key-123 expired',
          shouldNotContain: /test-secret-key-[0-9]+/,
          shouldContain: 'Credential'
        }
      ];
      
      for (const { input, shouldNotContain, shouldContain } of testCases) {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).not.toMatch(shouldNotContain);
        expect(sanitized).toContain(shouldContain);
      }
    });

    test('should sanitize model names', () => {
      const messages = [
        'Model claude-3-opus-20240229 not available',
        'Using gpt-4-turbo-preview',
        'Failed to load claude-instant-1.2',
        'text-davinci-003 is deprecated'
      ];
      
      for (const message of messages) {
        const sanitized = sanitizeErrorMessage(message);
        expect(sanitized).not.toMatch(/claude-[0-9a-z-]+/);
        expect(sanitized).not.toMatch(/gpt-[0-9a-z-]+/);
        expect(sanitized).not.toMatch(/text-davinci-[0-9]+/);
        expect(sanitized).toContain('AI model');
      }
    });

    test('should handle complex error messages', () => {
      const message = 'Failed to connect to https://api.anthropic.com/v1/messages with API key sk-ant-123456: Model claude-3-sonnet not available';
      const sanitized = sanitizeErrorMessage(message);
      
      expect(sanitized).toBe('Failed to connect to AI provider API credential: Model AI model not available');
    });

    test('should preserve helpful error context', () => {
      const messages = [
        { 
          input: 'Network timeout after 30 seconds',
          expected: 'Network timeout after 30 seconds'
        },
        {
          input: 'Rate limit exceeded, retry after 60 seconds',
          expected: 'Rate limit exceeded, retry after 60 seconds'
        },
        {
          input: 'Invalid JSON response received',
          expected: 'Invalid JSON response received'
        }
      ];
      
      for (const { input, expected } of messages) {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(expected);
      }
    });

    test('should handle edge cases', () => {
      expect(sanitizeErrorMessage('')).toBe('');
      expect(sanitizeErrorMessage('   ')).toBe('');
      expect(sanitizeErrorMessage('Simple error')).toBe('Simple error');
    });
  });

  describe('sanitizeError', () => {
    test('should sanitize Error objects', () => {
      const error = new Error('Failed to connect to Anthropic API');
      const sanitized = sanitizeError(error);
      
      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).toBe('Failed to connect to AI provider API');
      expect(sanitized.name).toBe('Error');
    });

    test('should handle non-Error objects', () => {
      const error = 'String error with OpenAI reference';
      const sanitized = sanitizeError(error);
      
      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).toBe('String error with AI provider reference');
    });

    test('should handle complex objects', () => {
      const error = { 
        message: 'Claude API failed', 
        code: 'ANTHROPIC_ERROR' 
      };
      const sanitized = sanitizeError(error);
      
      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.message).not.toContain('Claude');
      expect(sanitized.message).not.toContain('ANTHROPIC');
    });
  });
});

console.log('✅ Error sanitizer tests created');