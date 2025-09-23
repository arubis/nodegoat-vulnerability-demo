import { vi } from 'vitest';

export function setupFetchMock() {
  const mockFetch = vi.fn((url: string, options?: any) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    } as Response);
  });

  global.fetch = mockFetch as any;

  return mockFetch;
}

export function mockAIResponse(provider: string, content: string) {
  if (provider === 'anthropic') {
    return {
      content: [{ type: 'text', text: content }],
      role: 'assistant',
      model: 'claude-3-sonnet-20240229',
      usage: { input_tokens: 100, output_tokens: 200 }
    };
  } else if (provider === 'openai') {
    return {
      choices: [{
        message: { content, role: 'assistant' },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 100, completion_tokens: 200 }
    };
  }
  // Default response
  return { content };
}