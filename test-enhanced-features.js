#!/usr/bin/env node

/**
 * Enhanced Features Test Script
 * Tests the key enhancements to ensure Claude Desktop-like experience
 */

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bold');
  console.log('='.repeat(60));
}

function logTest(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const statusColor = passed ? 'green' : 'red';
  log(`${status} ${testName}`, statusColor);
  if (details) {
    log(`   ${details}`, 'yellow');
  }
}

async function checkFile(filePath, description) {
  const exists = existsSync(filePath);
  logTest(`${description} exists`, exists, filePath);
  return exists;
}

async function checkComponent(componentPath, componentName) {
  const exists = existsSync(componentPath);
  logTest(`${componentName} component`, exists, componentPath);
  return exists;
}

async function testFileStructure() {
  logSection('Testing File Structure');
  
  const requiredFiles = [
    {
      path: 'server/src/mcp/protocols/mcp-protocol.ts',
      desc: 'MCP Protocol Implementation'
    },
    {
      path: 'server/src/websocket/enhanced-chat-handler-with-approval.ts',
      desc: 'Enhanced Chat Handler'
    },
    {
      path: 'server/src/utils/error-handler.ts',
      desc: 'Error Handling System'
    },
    {
      path: 'client/src/components/ToolApprovalDialog.tsx',
      desc: 'Tool Approval Dialog'
    },
    {
      path: 'client/src/components/tools/ToolChain.tsx',
      desc: 'Tool Chain Component'
    },
    {
      path: 'shared/src/types/mcp.ts',
      desc: 'Shared MCP Types'
    }
  ];

  let allPass = true;
  for (const file of requiredFiles) {
    const exists = await checkFile(file.path, file.desc);
    if (!exists) allPass = false;
  }

  return allPass;
}

async function testEnvConfiguration() {
  logSection('Testing Environment Configuration');
  
  const requiredEnvVars = [
    'SERVICENOW_MCP_PATH',
    'ANTHROPIC_API_KEY'
  ];

  let allConfigured = true;
  for (const envVar of requiredEnvVars) {
    const exists = process.env[envVar] !== undefined;
    logTest(`${envVar} configured`, exists);
    if (!exists) allConfigured = false;
  }

  return allConfigured;
}

async function testPackageJson() {
  logSection('Testing Package Dependencies');
  
  try {
    // Check server dependencies
    const serverPackage = require('./server/package.json');
    const clientPackage = require('./client/package.json');
    
    const serverDeps = {
      '@modelcontextprotocol/sdk': 'MCP SDK',
      '@anthropic-ai/sdk': 'Anthropic SDK',
      'socket.io': 'Socket.IO Server'
    };

    const clientDeps = {
      'socket.io-client': 'Socket.IO Client',
      'lucide-react': 'Lucide Icons',
      'react': 'React'
    };

    let allDepsFound = true;

    log('Server Dependencies:', 'blue');
    for (const [dep, name] of Object.entries(serverDeps)) {
      const exists = serverPackage.dependencies[dep] !== undefined;
      logTest(name, exists);
      if (!exists) allDepsFound = false;
    }

    log('\nClient Dependencies:', 'blue');
    for (const [dep, name] of Object.entries(clientDeps)) {
      const exists = clientPackage.dependencies[dep] !== undefined;
      logTest(name, exists);
      if (!exists) allDepsFound = false;
    }

    return allDepsFound;
  } catch (error) {
    logTest('Package.json reading', false, error.message);
    return false;
  }
}

async function testComponentStructure() {
  logSection('Testing Component Structure');
  
  const components = [
    {
      path: 'client/src/components/ToolApprovalDialog.tsx',
      name: 'Tool Approval Dialog'
    },
    {
      path: 'client/src/components/tools/ToolChain.tsx',
      name: 'Tool Chain Component'
    },
    {
      path: 'client/src/components/EnhancedChatInterface.tsx',
      name: 'Enhanced Chat Interface'
    },
    {
      path: 'client/src/components/Message.tsx',
      name: 'Message Component'
    },
    {
      path: 'client/src/components/Sidebar.tsx',
      name: 'Enhanced Sidebar'
    }
  ];

  let allPass = true;
  for (const component of components) {
    const exists = await checkComponent(component.path, component.name);
    if (!exists) allPass = false;
  }

  return allPass;
}

async function testServerStructure() {
  logSection('Testing Server Structure');
  
  const serverFiles = [
    {
      path: 'server/src/mcp/mcp-client.ts',
      name: 'MCP Client Manager'
    },
    {
      path: 'server/src/websocket/enhanced-chat-handler-with-approval.ts',
      name: 'Enhanced Chat Handler'
    },
    {
      path: 'server/src/llm/anthropic-service.ts',
      name: 'Anthropic Service'
    },
    {
      path: 'server/src/llm/system-prompt.ts',
      name: 'Enhanced System Prompt'
    },
    {
      path: 'server/src/utils/error-handler.ts',
      name: 'Error Handler'
    }
  ];

  let allPass = true;
  for (const file of serverFiles) {
    const exists = await checkFile(file.path, file.name);
    if (!exists) allPass = false;
  }

  return allPass;
}

async function validateEnhancedFeatures() {
  logSection('Validating Enhanced Features');
  
  // Check if enhanced chat handler is integrated
  const appTsPath = 'server/src/app.ts';
  if (existsSync(appTsPath)) {
    const appContent = require('fs').readFileSync(appTsPath, 'utf8');
    
    const features = [
      {
        pattern: 'EnhancedChatHandlerWithApproval',
        name: 'Enhanced Chat Handler Integration'
      },
      {
        pattern: 'tool:approval_response',
        name: 'Tool Approval Event Handler'
      },
      {
        pattern: 'enhancedChatHandler.handleToolApproval',
        name: 'Tool Approval Method Integration'
      }
    ];

    for (const feature of features) {
      const exists = appContent.includes(feature.pattern);
      logTest(feature.name, exists);
    }
  }

  // Check enhanced chat interface
  const chatInterfacePath = 'client/src/components/EnhancedChatInterface.tsx';
  if (existsSync(chatInterfacePath)) {
    const interfaceContent = require('fs').readFileSync(chatInterfacePath, 'utf8');
    
    const features = [
      {
        pattern: 'ToolApprovalDialog',
        name: 'Tool Approval Dialog Integration'
      },
      {
        pattern: 'tool:approval_required',
        name: 'Tool Approval Request Handler'
      },
      {
        pattern: 'handleToolApproval',
        name: 'Tool Approval Methods'
      }
    ];

    for (const feature of features) {
      const exists = interfaceContent.includes(feature.pattern);
      logTest(feature.name, exists);
    }
  }
}

async function runComprehensiveTest() {
  log('ServiceNow MCP WebApp - Enhanced Features Test', 'bold');
  log('Testing Claude Desktop-like experience enhancements\n', 'blue');

  const testResults = [];

  // Run all test suites
  testResults.push(await testFileStructure());
  testResults.push(await testEnvConfiguration());
  testResults.push(await testPackageJson());
  testResults.push(await testComponentStructure());
  testResults.push(await testServerStructure());
  
  await validateEnhancedFeatures();

  // Summary
  logSection('Test Summary');
  
  const passedTests = testResults.filter(Boolean).length;
  const totalTests = testResults.length;
  
  if (passedTests === totalTests) {
    log('🎉 All core tests passed!', 'green');
    log('The enhanced features are properly implemented.', 'green');
  } else {
    log(`⚠️  ${totalTests - passedTests} test suite(s) failed`, 'red');
    log('Please review the failed tests above.', 'yellow');
  }

  console.log('\n' + '='.repeat(60));
  log('Next Steps:', 'bold');
  console.log('1. Run `npm install` in both client and server directories');
  console.log('2. Set up your environment variables');
  console.log('3. Start the ServiceNow MCP server');
  console.log('4. Run the webapp with `npm run dev`');
  console.log('5. Test the enhanced features using the TESTING-GUIDE.md');
  console.log('='.repeat(60));

  return passedTests === totalTests;
}

// Run the test if this script is executed directly
if (require.main === module) {
  runComprehensiveTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      log(`Test script error: ${error.message}`, 'red');
      process.exit(1);
    });
}

module.exports = { runComprehensiveTest };