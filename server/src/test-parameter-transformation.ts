import { MCPParameterTransformer } from './mcp/mcp-parameter-transformer';
import { createLogger } from './utils/logger';

const logger = createLogger();

// Test cases for parameter transformation
const testCases = [
  {
    name: 'Test 1: Create catalog item with structured params',
    toolName: 'servicenow-mcp:create-catalog-item',
    inputParams: {
      name: 'Employee Onboarding Request',
      category: 'HR'
    },
    userMessage: 'Create a catalog item for employee onboarding in HR',
    expected: {
      command: "Create a catalog item called 'Employee Onboarding Request' in HR"
    }
  },
  {
    name: 'Test 2: Create catalog item with command already present',
    toolName: 'servicenow-mcp:create-catalog-item',
    inputParams: {
      command: "Create a catalog item called 'Software Request' in IT"
    },
    userMessage: '',
    expected: {
      command: "Create a catalog item called 'Software Request' in IT"
    }
  },
  {
    name: 'Test 3: Query records (non-command tool)',
    toolName: 'servicenow-mcp:query-records',
    inputParams: {
      table: 'incident',
      query: 'active=true',
      limit: '5'
    },
    userMessage: '',
    expected: {
      table: 'incident',
      sysparm_query: 'active=true',
      sysparm_limit: '5',
      sysparm_fields: ''
    }
  },
  {
    name: 'Test 4: Create business rule',
    toolName: 'servicenow-mcp:create-business-rule',
    inputParams: {
      name: 'Auto Assignment Rule',
      table: 'incident'
    },
    userMessage: '',
    expected: {
      command: "Create a business rule called 'Auto Assignment Rule' on incident table"
    }
  },
  {
    name: 'Test 5: Test connection (no params)',
    toolName: 'servicenow-mcp:test-connection',
    inputParams: {},
    userMessage: '',
    expected: {}
  }
];

console.log('=== Testing MCPParameterTransformer ===\n');

testCases.forEach((testCase, index) => {
  console.log(`\n${testCase.name}`);
  console.log('Input:', {
    toolName: testCase.toolName,
    params: testCase.inputParams,
    userMessage: testCase.userMessage || '(none)'
  });
  
  const result = MCPParameterTransformer.transformParameters(
    testCase.toolName,
    testCase.inputParams,
    testCase.userMessage
  );
  
  console.log('Output:', result);
  console.log('Expected:', testCase.expected);
  
  const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
  console.log('Result:', passed ? '✅ PASSED' : '❌ FAILED');
  
  if (!passed) {
    console.log('Difference:');
    console.log('  Actual keys:', Object.keys(result).sort());
    console.log('  Expected keys:', Object.keys(testCase.expected).sort());
  }
});

console.log('\n=== Test Complete ===');