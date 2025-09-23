import { SecurityDetectorV2 } from './src/security/detector-v2.js';

async function test() {
  process.env.RSOLV_API_KEY = 'rsolv_staging_test_key_2024';
  process.env.RSOLV_API_URL = 'https://api.rsolv-staging.com';
  
  const detector = new SecurityDetectorV2();
  const jsCode = `
function processUserInput(userInput) {
  // Vulnerable: Direct eval of user input
  const result = eval(userInput);
  return result;
}`;

  console.log('Testing eval detection...');
  const results = await detector.detect(jsCode, 'javascript', 'vulnerable.js');
  
  console.log('Results:', JSON.stringify(results, null, 2));
  console.log('Total vulnerabilities found:', results.length);
  
  if (results.length > 0) {
    const evalVuln = results.find((v) => 
      v.type === 'js-eval-injection' || 
      v.type === 'eval-injection' ||
      v.type === 'code-injection'
    );
    console.log('Eval vulnerability found:', evalVuln ? 'Yes' : 'No');
    if (evalVuln) {
      console.log('Eval vulnerability details:', evalVuln);
    }
  }
}

test().catch(console.error);
