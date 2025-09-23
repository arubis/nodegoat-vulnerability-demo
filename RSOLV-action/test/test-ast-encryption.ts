import { ElixirASTAnalyzer } from '../src/security/analyzers/elixir-ast-analyzer';

async function testASTEncryption() {
  const analyzer = new ElixirASTAnalyzer({
    apiUrl: 'http://localhost:4002',
    apiKey: 'rsolv_test_suite_key',
    debug: true
  });

  const pythonCode = `import os
def run(user_input):
    os.system("echo " + user_input)
`;

  try {
    console.log('Testing AST analysis with encryption...');
    console.log('Sending code:', pythonCode);
    const response = await analyzer.analyze([{ path: 'app.py', content: pythonCode }]);  // Changed from test.py
    console.log('Full Response:', JSON.stringify(response, null, 2));
    
    const result = response.results?.[0];
    if (result?.status === 'success') {
      console.log('✅ AST analysis succeeded');
      console.log('Findings found:', result.findings?.length || 0);
      console.log('Patterns found:', result.patterns?.length || 0);
      console.log('Result keys:', Object.keys(result));
    } else {
      console.log('❌ AST analysis failed:', result?.error);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testASTEncryption();