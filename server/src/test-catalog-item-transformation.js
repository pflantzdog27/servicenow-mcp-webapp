const { MCPParameterTransformer } = require('./mcp/mcp-parameter-transformer');

console.log('=== Testing Catalog Item Parameter Transformation ===\n');

// Test cases that might come from the LLM
const testCases = [
  {
    name: 'LLM generates structured parameters',
    toolName: 'servicenow-mcp:create-catalog-item',
    inputParams: {
      name: 'Employee Onboarding Request',
      category: 'HR',
      description: 'Request for new employee setup'
    },
    userMessage: 'Create a catalog item for employee onboarding in HR'
  },
  {
    name: 'LLM generates empty parameters',
    toolName: 'servicenow-mcp:create-catalog-item', 
    inputParams: {},
    userMessage: 'Create a catalog item called Office Supplies in Hardware'
  },
  {
    name: 'LLM generates minimal parameters',
    toolName: 'servicenow-mcp:create-catalog-item',
    inputParams: {
      name: 'Test Item'
    },
    userMessage: 'Create a catalog item called Test Item'
  }
];

console.log('Testing parameter transformation...\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('Input params:', testCase.inputParams);
  console.log('User message:', testCase.userMessage);
  
  try {
    const result = MCPParameterTransformer.transformParameters(
      testCase.toolName,
      testCase.inputParams, 
      testCase.userMessage
    );
    
    console.log('Transformed:', result);
    console.log('✅ SUCCESS\n');
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    console.log();
  }
});

console.log('=== Test Complete ===');