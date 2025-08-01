import { MCPParameterTransformer } from './mcp/mcp-parameter-transformer';
import { createLogger } from './utils/logger';

const logger = createLogger();

// Test the parameter transformation fix
function testCatalogItemParameterTransformation() {
  logger.info('=== Testing Catalog Item Parameter Transformation Fix ===');

  const testCases = [
    {
      name: 'Test 1: LLM provides name and category parameters',
      toolName: 'servicenow-mcp:create-catalog-item',
      userMessage: 'Create a catalog item called Employee Onboarding Request in HR',
      originalParams: {
        name: 'Employee Onboarding Request',
        category: 'HR'
      },
      expectedCommand: "Create a catalog item called 'Employee Onboarding Request' in HR"
    },
    {
      name: 'Test 2: LLM provides only name parameter',
      toolName: 'servicenow-mcp:create-catalog-item', 
      userMessage: 'Create a laptop request catalog item',
      originalParams: {
        name: 'Laptop Request'
      },
      expectedCommand: "Create a catalog item called 'Laptop Request' in General"
    },
    {
      name: 'Test 3: User message extraction',
      toolName: 'servicenow-mcp:create-catalog-item',
      userMessage: 'Create a catalog item called Software License Request in IT',
      originalParams: {},
      expectedCommand: "Create a catalog item called 'Software License Request' in IT"
    },
    {
      name: 'Test 4: Non-prefixed tool name',
      toolName: 'create-catalog-item',
      userMessage: 'Create printer maintenance catalog item',
      originalParams: {
        name: 'Printer Maintenance'
      },
      expectedCommand: "Create a catalog item called 'Printer Maintenance' in General"
    },
    {
      name: 'Test 5: Command already in correct format',
      toolName: 'servicenow-mcp:create-catalog-item',
      userMessage: 'Create a catalog item called Test Item',
      originalParams: {
        command: "Create a catalog item called 'Test Item' in General"
      },
      expectedCommand: "Create a catalog item called 'Test Item' in General"
    }
  ];

  let allTestsPassed = true;

  for (const testCase of testCases) {
    logger.info(`\n--- ${testCase.name} ---`);
    logger.info(`Tool Name: ${testCase.toolName}`);
    logger.info(`User Message: ${testCase.userMessage}`);
    logger.info(`Original Params:`, testCase.originalParams);
    logger.info(`Expected Command: ${testCase.expectedCommand}`);

    try {
      const transformedParams = MCPParameterTransformer.transformParameters(
        testCase.toolName,
        testCase.originalParams,
        testCase.userMessage
      );

      logger.info(`Transformed Params:`, transformedParams);

      if (transformedParams.command === testCase.expectedCommand) {
        logger.info('✅ TEST PASSED');
      } else {
        logger.error('❌ TEST FAILED');
        logger.error(`Expected: ${testCase.expectedCommand}`);
        logger.error(`Got: ${transformedParams.command}`);
        allTestsPassed = false;
      }
    } catch (error) {
      logger.error('❌ TEST ERROR:', error);
      allTestsPassed = false;
    }
  }

  logger.info(`\n=== Test Summary ===`);
  if (allTestsPassed) {
    logger.info('🎉 All tests passed! The parameter transformation fix is working.');
  } else {
    logger.error('❌ Some tests failed. Review the output above.');
  }

  return allTestsPassed;
}

// Test the MCP server command parsing logic
function testMCPServerCommandParsing() {
  logger.info('\n=== Testing MCP Server Command Parsing ===');
  
  // Simulate the MCP server's command parsing logic
  const testCommands = [
    "Create a catalog item called 'Employee Onboarding Request' in HR",
    "Create a catalog item called 'Laptop Request' in General", 
    "Create a catalog item called 'Software License Request' in IT",
    "Create a catalog item called 'Test Item' in General"
  ];

  for (const command of testCommands) {
    logger.info(`\nTesting command: ${command}`);
    
    // This is the exact regex from the MCP server (simple-server.ts line 591)
    const nameMatch = command.match(/called\s+['"]([^'"]+)['"]/i);
    const categoryMatch = command.match(/in\s+([^'"]+?)(?:\s|$)/i);
    
    if (nameMatch) {
      const itemName = nameMatch[1];
      const category = categoryMatch ? categoryMatch[1].trim() : 'General';
      
      logger.info(`✅ Successfully parsed: name="${itemName}", category="${category}"`);
    } else {
      logger.error(`❌ Could not extract catalog item name from: ${command}`);
    }
  }
}

// Run the tests
if (require.main === module) {
  testCatalogItemParameterTransformation();
  testMCPServerCommandParsing();
}

export { testCatalogItemParameterTransformation, testMCPServerCommandParsing };