import { createLogger } from '../utils/logger';

const logger = createLogger();

// Version stamp for deployment verification
const MODULE_VERSION = 'MCPParameterTransformer-2.1.0-EMERGENCY-EXTRACTION';
console.log(`🚀 [MODULE-LOAD] ${MODULE_VERSION} loaded at ${new Date().toISOString()}`);
logger.info(`🚀 [MODULE-LOAD] ${MODULE_VERSION} - Emergency parameter extraction system ACTIVE`);

export interface ToolCallParameters {
  [key: string]: any;
}

/**
 * Transforms tool parameters based on the tool name and expected format
 * This handles the specific parameter formats required by ServiceNow MCP tools
 */
export class MCPParameterTransformer {
  /**
   * Transform parameters for ServiceNow MCP tools
   */
  static transformParameters(toolName: string, rawParameters: ToolCallParameters, userMessage?: string): ToolCallParameters {
    console.log('🚨 [TRANSFORMER] CANARY LOG - FUNCTION CALLED!', {
      toolName,
      rawParameters,
      userMessage,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`[MCP-TRANSFORMER] Transforming parameters for tool: ${toolName}`, {
      toolName,
      rawParameters,
      userMessage
    });

    // CRITICAL FIX: If Claude sends empty arguments, try to extract from userMessage
    const isEmpty = !rawParameters || Object.keys(rawParameters).length === 0;
    
    logger.info(`🔍 [PARAMETER-CHECK] Analyzing parameters:`, {
      toolName,
      hasRawParams: !!rawParameters,
      rawParamKeys: rawParameters ? Object.keys(rawParameters) : [],
      isEmpty,
      hasUserMessage: !!userMessage,
      userMessageLength: userMessage?.length || 0
    });
    
    if (isEmpty && userMessage) {
      logger.info(`🚨 [EMERGENCY-EXTRACTION] EMPTY ARGUMENTS DETECTED - Attempting extraction from user message:`, {
        toolName,
        userMessage
      });
      console.log(`🚨 [EMERGENCY-EXTRACTION] ACTIVATED for tool: ${toolName}`);
      console.log(`🚨 [EMERGENCY-EXTRACTION] User message: "${userMessage}"`);
      
      rawParameters = this.extractParametersFromMessage(toolName, userMessage);
      
      logger.info(`🔧 [EMERGENCY-EXTRACTION] Extraction result:`, {
        toolName,
        extractedParams: rawParameters,
        extractedKeys: Object.keys(rawParameters)
      });
      console.log(`🔧 [EMERGENCY-EXTRACTION] Result:`, rawParameters);
    } else if (isEmpty) {
      logger.warn(`🚨 [PARAMETER-WARNING] Empty arguments but no user message to extract from!`, {
        toolName
      });
      console.log(`🚨 [PARAMETER-WARNING] Tool ${toolName} has empty args and no user message for extraction!`);
    } else {
      logger.info(`✅ [PARAMETER-OK] Tool has valid parameters, no extraction needed`, {
        toolName,
        paramKeys: Object.keys(rawParameters)
      });
      console.log(`✅ [PARAMETER-OK] Tool ${toolName} has valid parameters:`, Object.keys(rawParameters));
    }

    let transformedParams: ToolCallParameters = {};

    // Handle both prefixed and non-prefixed tool names
    const normalizedToolName = toolName.replace('servicenow-mcp:', '');

    // List of tools that expect a 'command' parameter
    const commandBasedTools = [
      'create-catalog-item',
      'create-record-producer',
      // NOTE: create-variable uses structured parameters, not command format
      'create-variable-set',
      'create-ui-policy',
      'create-catalog-ui-policy',
      'create-catalog-ui-policy-action',
      'create-script-include',
      'create-scheduled-job',
      'create-email-notification',
      'create-catalog-client-script',
      'create-ui-policy-action',
      'create-client-script',
      'create-business-rule',
      'create-table-field',
      'create-assignment-group',
      'implement-invoice-status-inquiry',
      'create-update-set',
      'set-current-update-set',
      'create-application-scope',
      'set-application-scope',
      'create-flow',
      'create-flow-trigger',
      'add-create-record-action',
      'add-send-email-action'
    ];

    // Check if this tool expects a command parameter
    if (commandBasedTools.includes(normalizedToolName)) {
      // If command is already provided and valid, use it
      if (rawParameters.command && typeof rawParameters.command === 'string') {
        transformedParams = { command: rawParameters.command };
      } else {
        // Transform structured parameters to command format
        transformedParams = this.transformToCommandFormat(normalizedToolName, rawParameters, userMessage);
      }
    } else {
      // Handle specific non-command tools
      switch (normalizedToolName) {
        case 'query-records':
          transformedParams = this.transformQueryParams(rawParameters);
          break;

        case 'create-record':
          transformedParams = this.transformCreateRecordParams(rawParameters);
          break;

        case 'create-variable':
          // create-variable uses structured parameters, not command format
          transformedParams = this.transformCreateVariableParams(rawParameters, userMessage);
          break;

        case 'test-connection':
          // No parameters needed
          transformedParams = {};
          break;

        default:
          // For unknown tools, pass parameters as-is
          transformedParams = rawParameters;
          break;
      }
    }

    logger.info(`[MCP-TRANSFORMER] Transformed parameters:`, {
      toolName,
      transformedParams
    });

    return transformedParams;
  }

  /**
   * Extract parameters from user message when Claude provides empty arguments
   */
  private static extractParametersFromMessage(toolName: string, userMessage: string): ToolCallParameters {
    const normalizedToolName = toolName.replace('servicenow-mcp:', '');
    
    logger.info(`🔧 [EMERGENCY-EXTRACTION] Extracting parameters for ${normalizedToolName} from: "${userMessage}"`);
    
    switch (normalizedToolName) {
      case 'create-catalog-item':
        return this.extractCatalogItemFromMessage(userMessage);
      
      case 'create-record':
        return this.extractRecordFromMessage(userMessage);
      
      case 'query-records':
        return this.extractQueryFromMessage(userMessage);
      
      case 'create-variable':
        return this.extractVariableFromMessage(userMessage);
      
      default:
        logger.warn(`[EMERGENCY-EXTRACTION] No extraction logic for tool: ${normalizedToolName}`);
        return {};
    }
  }

  private static extractCatalogItemFromMessage(message: string): ToolCallParameters {
    // Extract catalog item name from various patterns
    const patterns = [
      /create\s+(?:a\s+)?catalog\s+item\s+(?:called\s+)?['"]([^'"]+)['"]?/i,
      /create\s+(?:a\s+)?catalog\s+item\s+for\s+([A-Z][A-Za-z\s]+)/i,
      /catalog\s+item\s+called\s+['"]([^'"]+)['"]?/i,
      /catalog\s+item\s+for\s+([A-Z][A-Za-z\s]+)/i,
      /make\s+(?:a\s+)?['"]([^'"]+)['"]?\s+catalog\s+item/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        const itemName = match[1].trim();
        const command = `Create a catalog item called '${itemName}' in General`;
        logger.info(`🎯 [EMERGENCY-EXTRACTION] Extracted catalog item: "${itemName}" -> "${command}"`);
        return { command };
      }
    }
    
    // Fallback
    const fallbackCommand = "Create a catalog item called 'New Request' in General";
    logger.warn(`🚨 [EMERGENCY-EXTRACTION] Using fallback command: "${fallbackCommand}"`);
    return { command: fallbackCommand };
  }

  private static extractRecordFromMessage(message: string): ToolCallParameters {
    // Extract incident/record details
    const table = message.toLowerCase().includes('incident') ? 'incident' :
                  message.toLowerCase().includes('problem') ? 'problem' :
                  message.toLowerCase().includes('change') ? 'change_request' : 'incident';
    
    // Extract description
    const descPatterns = [
      /create\s+(?:an?\s+)?(?:incident|record|problem|change)\s+for\s+([^.!?]+)/i,
      /(?:incident|problem|change)\s+for\s+([^.!?]+)/i,
      /log\s+(?:an?\s+)?([^.!?]+)/i
    ];
    
    let description = 'New Request';
    for (const pattern of descPatterns) {
      const match = message.match(pattern);
      if (match) {
        description = match[1].trim();
        break;
      }
    }
    
    const result = {
      table,
      fields: {
        short_description: description,
        priority: "3",
        category: "inquiry"
      }
    };
    
    logger.info(`🎯 [EMERGENCY-EXTRACTION] Extracted record:`, result);
    return result;
  }

  private static extractQueryFromMessage(message: string): ToolCallParameters {
    const table = message.toLowerCase().includes('incident') ? 'incident' :
                  message.toLowerCase().includes('problem') ? 'problem' :
                  message.toLowerCase().includes('change') ? 'change_request' :
                  message.toLowerCase().includes('catalog') ? 'sc_cat_item' : 'incident';
    
    const result = {
      table,
      limit: 10,
      fields: "sys_id,number,short_description,state"
    };
    
    logger.info(`🎯 [EMERGENCY-EXTRACTION] Extracted query:`, result);
    return result;
  }

  private static extractVariableFromMessage(message: string): ToolCallParameters {
    logger.info(`🔧 [EMERGENCY-EXTRACTION] Extracting variable parameters from: "${message}"`);
    
    // Check if user wants multiple variables
    const multiVariableMatch = message.match(/create\s+(\w+|\d+)\s+(?:random\s+)?variables/i);
    if (multiVariableMatch) {
      const count = multiVariableMatch[1];
      logger.info(`🎯 [EMERGENCY-EXTRACTION] Detected request for ${count} variables`);
      
      // For "three random variables" request, create a generic sample variable
      // The handler should create multiple calls for this
      return {
        name: "sample_variable_1",
        question_text: "Sample Variable 1", 
        type: "string",
        catalog_item: "NEEDS_CATALOG_ITEM_SYS_ID" // This will be replaced by the handler
      };
    }
    
    // Extract specific variable details
    const patterns = [
      // "Create a variable named 'employee_name' with question text 'Employee Name' of type string"
      /variable\s+named\s+['"]([^'"]+)['"].*question\s+text\s+['"]([^'"]+)['"].*type\s+(\w+)/i,
      // "Add a text field for employee name"
      /add\s+(?:a\s+)?(\w+)\s+field\s+for\s+([A-Za-z\s]+)/i,
      // "Create a dropdown for equipment type"
      /create\s+(?:a\s+)?dropdown\s+for\s+([A-Za-z\s]+)/i,
      // "Create variable for [field name]"
      /create\s+variable\s+for\s+([A-Za-z\s]+)/i,
      // Generic "create variable" - will use defaults
      /create\s+(?:a\s+)?variable/i
    ];
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = message.match(pattern);
      if (match) {
        logger.info(`🎯 [EMERGENCY-EXTRACTION] Matched pattern ${i + 1}: ${pattern}`);
        
        switch (i) {
          case 0: // Named with question text and type
            return {
              name: match[1].toLowerCase().replace(/\s+/g, '_'),
              question_text: match[2],
              type: match[3].toLowerCase(),
              catalog_item: "NEEDS_CATALOG_ITEM_SYS_ID"
            };
          case 1: // "Add a text field for employee name"
            const fieldType = match[1].toLowerCase();
            const fieldName = match[2].toLowerCase().replace(/\s+/g, '_');
            return {
              name: fieldName,
              question_text: match[2],
              type: fieldType === 'text' ? 'string' : fieldType,
              catalog_item: "NEEDS_CATALOG_ITEM_SYS_ID"
            };
          case 2: // "Create a dropdown for equipment type"
            const dropdownName = match[1].toLowerCase().replace(/\s+/g, '_');
            return {
              name: dropdownName,
              question_text: match[1],
              type: "choice",
              choices: "Option 1,Option 2,Option 3",
              catalog_item: "NEEDS_CATALOG_ITEM_SYS_ID"
            };
          case 3: // "Create variable for [field name]"
            const varName = match[1].toLowerCase().replace(/\s+/g, '_');
            return {
              name: varName,
              question_text: match[1],
              type: "string",
              catalog_item: "NEEDS_CATALOG_ITEM_SYS_ID"
            };
          case 4: // Generic "create variable"
            return {
              name: "new_variable",
              question_text: "New Variable",
              type: "string",
              catalog_item: "NEEDS_CATALOG_ITEM_SYS_ID"
            };
        }
      }
    }
    
    logger.warn(`🚨 [EMERGENCY-EXTRACTION] Could not extract variable parameters from message`);
    return {};
  }

  /**
   * Transform catalog item creation parameters
   * Expected format: { command: "Create a catalog item called 'ItemName' in Category" }
   */
  private static transformCatalogItemParams(params: ToolCallParameters, userMessage?: string): ToolCallParameters {
    logger.info(`[MCP-TRANSFORMER] Transforming catalog item params:`, {
      originalParams: params,
      userMessage
    });

    // Check if command is already in the correct format
    if (params.command && typeof params.command === 'string') {
      // Validate the command format - must contain "called" and quoted item name
      if (params.command.includes('called') && (params.command.includes("'") || params.command.includes('"'))) {
        logger.info(`[MCP-TRANSFORMER] Command already in correct format:`, { command: params.command });
        return { command: params.command };
      }
    }

    // Extract item name from various possible parameter formats
    let itemName = params.name || params.item_name || params.title || 'New Catalog Item';
    let category = params.category || params.catalog || 'General';

    // If we have a user message, try to extract the item name from it
    if (userMessage) {
      // Look for patterns like "create a catalog item called Test Item"
      // Be more specific with the patterns to avoid over-capturing
      const calledMatch = userMessage.match(/called\s+['"]?([^'"]+?)['"]?\s+in\s+/i) || 
                         userMessage.match(/called\s+['"]?([^'"]+?)['"]?(?:\s*$)/i) ||
                         userMessage.match(/called\s+([A-Z][A-Za-z\s]+?)\s+in\s+/i);
      const namedMatch = userMessage.match(/named\s+['"]([^'"]+)['"](?:\s+in\s+|$)/i);
      const createMatch = userMessage.match(/create\s+(?:a\s+)?([A-Z][A-Za-z\s]+?)\s+catalog\s+item/i);
      
      if (calledMatch) {
        itemName = calledMatch[1].trim();
        logger.info(`[MCP-TRANSFORMER] Extracted item name from 'called' pattern:`, { itemName });
      } else if (namedMatch) {
        itemName = namedMatch[1].trim();
        logger.info(`[MCP-TRANSFORMER] Extracted item name from 'named' pattern:`, { itemName });
      } else if (createMatch) {
        itemName = createMatch[1].trim();
        logger.info(`[MCP-TRANSFORMER] Extracted item name from 'create' pattern:`, { itemName });
      }

      // Extract category - be more specific to avoid capturing item names
      const categoryMatch = userMessage.match(/\sin\s+([A-Z][A-Za-z\s]*?)(?:\s*$|\s+category|$)/i);
      if (categoryMatch) {
        category = categoryMatch[1].trim();
        logger.info(`[MCP-TRANSFORMER] Extracted category:`, { category });
      }
    }

    // If no item name was extracted from user message, use parameter values
    // Prioritize the provided parameters if they have reasonable values
    if (params.name && !userMessage?.includes('called')) {
      itemName = params.name;
      logger.info(`[MCP-TRANSFORMER] Using provided item name parameter:`, { itemName });
    }

    // Clean up item name - remove quotes if they exist
    itemName = itemName.replace(/^['"]|['"]$/g, '');

    // Build the command in the EXACT format expected by the MCP server
    const command = `Create a catalog item called '${itemName}' in ${category}`;

    logger.info(`[MCP-TRANSFORMER] Generated command:`, { 
      command,
      itemName,
      category
    });

    return { command };
  }

  /**
   * Transform incident creation parameters
   */
  private static transformIncidentParams(params: ToolCallParameters, userMessage?: string): ToolCallParameters {
    // ServiceNow incidents typically need these fields
    const transformed: ToolCallParameters = {
      short_description: params.short_description || params.title || params.summary || 'New Incident',
      description: params.description || params.details || userMessage || '',
      urgency: params.urgency || '3',
      impact: params.impact || '3',
      category: params.category || 'inquiry',
      subcategory: params.subcategory || 'internal'
    };

    // Only include fields that have values
    return Object.fromEntries(
      Object.entries(transformed).filter(([_, value]) => value !== undefined && value !== '')
    );
  }

  /**
   * Transform query parameters
   */
  private static transformQueryParams(params: ToolCallParameters): ToolCallParameters {
    const transformed: ToolCallParameters = {
      table: params.table || 'incident',
      sysparm_query: params.sysparm_query || params.query || '',
      sysparm_limit: params.sysparm_limit || params.limit || '10',
      sysparm_fields: params.sysparm_fields || params.fields || ''
    };

    // Remove empty fields
    return Object.fromEntries(
      Object.entries(transformed).filter(([_, value]) => value !== '')
    );
  }

  /**
   * Transform update parameters
   */
  private static transformUpdateParams(params: ToolCallParameters): ToolCallParameters {
    const transformed: ToolCallParameters = {
      table: params.table || 'incident',
      sys_id: params.sys_id || params.id || '',
      ...params.updates || {}
    };

    return transformed;
  }

  /**
   * Transform workflow creation parameters
   */
  private static transformWorkflowParams(params: ToolCallParameters, userMessage?: string): ToolCallParameters {
    // Check if command format is expected
    if (params.command && typeof params.command === 'string') {
      return { command: params.command };
    }

    // Build command format if needed
    const workflowName = params.name || params.workflow_name || 'New Workflow';
    const command = `Create a workflow called '${workflowName}'`;

    return { command };
  }

  /**
   * Generic transformation to command format for tools that expect natural language commands
   */
  private static transformToCommandFormat(toolName: string, params: ToolCallParameters, userMessage?: string): ToolCallParameters {
    logger.info(`[MCP-TRANSFORMER] Generic command transformation for ${toolName}`, {
      params,
      userMessage
    });

    // For catalog items, always use the specific transformation
    if (toolName === 'create-catalog-item') {
      return this.transformCatalogItemParams(params, userMessage);
    }

    // Build command based on tool type and parameters
    let command = '';
    
    switch (toolName) {
      case 'create-record-producer':
        const producerName = params.name || params.producer_name || 'New Record Producer';
        command = `Create a record producer called '${producerName}'`;
        break;
        
      case 'create-variable':
        const varName = params.name || params.variable_name || 'New Variable';
        const varType = params.type || 'string';
        command = `Create a ${varType} variable called '${varName}'`;
        break;
        
      case 'create-business-rule':
        const ruleName = params.name || params.rule_name || 'New Business Rule';
        const table = params.table || 'incident';
        command = `Create a business rule called '${ruleName}' on ${table} table`;
        break;
        
      case 'create-script-include':
        const scriptName = params.name || params.script_name || 'New Script Include';
        command = `Create a script include called '${scriptName}'`;
        break;
        
      case 'create-flow':
        const flowName = params.name || params.flow_name || 'New Flow';
        command = `Create a flow called '${flowName}'`;
        break;
        
      default:
        // For other tools, try to construct a reasonable command
        const itemName = params.name || params.title || 'New Item';
        command = `Create ${toolName.replace(/-/g, ' ')} called '${itemName}'`;
        break;
    }

    logger.info(`[MCP-TRANSFORMER] Generated command: ${command}`);
    return { command };
  }

  /**
   * Transform create-record parameters
   */
  private static transformCreateRecordParams(params: ToolCallParameters): ToolCallParameters {
    // create-record expects table and fields
    const transformed: ToolCallParameters = {
      table: params.table || 'incident',
      ...params
    };
    
    delete transformed.command; // Remove command if present
    return transformed;
  }

  /**
   * Transform create-variable parameters
   */
  private static transformCreateVariableParams(params: ToolCallParameters, userMessage?: string): ToolCallParameters {
    logger.info(`[MCP-TRANSFORMER] Transforming create-variable params:`, {
      originalParams: params,
      userMessage
    });

    // If parameters are already provided and look valid, use them
    if (params.name && params.question_text && params.type && params.catalog_item) {
      logger.info(`[MCP-TRANSFORMER] Using provided create-variable parameters as-is`);
      return params;
    }

    // If parameters are empty or incomplete, we can't create variables without user context
    // This should not happen if Claude uses the tool correctly based on system prompt
    if (!params.catalog_item) {
      logger.warn(`[MCP-TRANSFORMER] create-variable missing catalog_item - cannot proceed`);
      return params; // Return as-is, will likely fail validation
    }

    // Pass through parameters - create-variable expects structured format
    const transformed = { ...params };
    delete transformed.command; // Remove command if somehow present
    
    logger.info(`[MCP-TRANSFORMER] Transformed create-variable parameters:`, transformed);
    return transformed;
  }

  /**
   * Extract catalog item name from natural language
   */
  static extractCatalogItemName(message: string): string | null {
    // Try various patterns to extract the item name
    const patterns = [
      /catalog\s+item\s+(?:called|named)\s+['"]([^'"]+)['"]/i,
      /create\s+['"]([^'"]+)['"]\s+catalog/i,
      /create\s+(?:a\s+)?([A-Z][^.!?]+?)\s+(?:catalog|in)/i,
      /catalog\s+item\s+for\s+([^.!?]+)/i
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }
}