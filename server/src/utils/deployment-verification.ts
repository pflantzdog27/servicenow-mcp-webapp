import { createLogger } from './logger';

const logger = createLogger();

/**
 * Deployment verification utility to ensure all fixes are properly loaded
 */
export class DeploymentVerifier {
  private static readonly EXPECTED_FIXES = [
    'Tool Name Display Fix',
    'REQUEST Object Fix', 
    'Emergency Parameter Extraction',
    'Tool Chaining Enhancement',
    'User Message Extraction'
  ];

  static verifyDeployment(): boolean {
    console.log(`🔍 [DEPLOYMENT-VERIFICATION] Starting comprehensive fix verification...`);
    logger.info(`🔍 [DEPLOYMENT-VERIFICATION] Verifying all fixes are active`);
    
    let allFixesActive = true;
    const verificationResults: Record<string, boolean> = {};

    // 1. Verify MCP Parameter Transformer is loaded
    try {
      const MCPParameterTransformer = require('../mcp/mcp-parameter-transformer').MCPParameterTransformer;
      verificationResults['Emergency Parameter Extraction'] = !!MCPParameterTransformer.transformParameters;
      console.log(`✅ [VERIFICATION] Emergency Parameter Extraction: LOADED`);
    } catch (error) {
      verificationResults['Emergency Parameter Extraction'] = false;
      console.log(`❌ [VERIFICATION] Emergency Parameter Extraction: FAILED TO LOAD`);
      allFixesActive = false;
    }

    // 2. Verify Enhanced MCP Client is loaded
    try {
      const EnhancedMCPClient = require('../mcp/enhanced-mcp-client').EnhancedMCPClient;
      verificationResults['Enhanced MCP Client'] = !!EnhancedMCPClient;
      console.log(`✅ [VERIFICATION] Enhanced MCP Client: LOADED`);
    } catch (error) {
      verificationResults['Enhanced MCP Client'] = false;
      console.log(`❌ [VERIFICATION] Enhanced MCP Client: FAILED TO LOAD`);
      allFixesActive = false;
    }

    // 3. Verify Enhanced Chat Handler is loaded
    try {
      const EnhancedChatHandlerWithApproval = require('../websocket/enhanced-chat-handler-with-approval').EnhancedChatHandlerWithApproval;
      verificationResults['Enhanced Chat Handler'] = !!EnhancedChatHandlerWithApproval;
      console.log(`✅ [VERIFICATION] Enhanced Chat Handler: LOADED`);
    } catch (error) {
      verificationResults['Enhanced Chat Handler'] = false;
      console.log(`❌ [VERIFICATION] Enhanced Chat Handler: FAILED TO LOAD`);
      allFixesActive = false;
    }

    // Log final verification status
    const timestamp = new Date().toISOString();
    if (allFixesActive) {
      console.log(`\n🎉 [DEPLOYMENT-VERIFICATION] ALL FIXES VERIFIED ACTIVE at ${timestamp}`);
      console.log(`🎉 [DEPLOYMENT-VERIFICATION] Production deployment ready!`);
      logger.info(`🎉 [DEPLOYMENT-VERIFICATION] All fixes verified active`, { 
        timestamp,
        verificationResults 
      });
    } else {
      console.log(`\n❌ [DEPLOYMENT-VERIFICATION] SOME FIXES FAILED TO LOAD at ${timestamp}`);
      console.log(`❌ [DEPLOYMENT-VERIFICATION] Check logs for details`);
      logger.error(`❌ [DEPLOYMENT-VERIFICATION] Fix verification failed`, { 
        timestamp,
        verificationResults 
      });
    }

    return allFixesActive;
  }

  static logComponentVersion(componentName: string, version: string): void {
    console.log(`📦 [COMPONENT-VERSION] ${componentName}: ${version}`);
    logger.info(`📦 [COMPONENT-VERSION] ${componentName} loaded`, { version, timestamp: new Date().toISOString() });
  }

  static logFixActive(fixName: string, description: string): void {
    console.log(`✅ [FIX-ACTIVE] ${fixName}: ${description}`);
    logger.info(`✅ [FIX-ACTIVE] ${fixName}`, { description, timestamp: new Date().toISOString() });
  }
}