import { createLogger } from '../utils/logger';

const logger = createLogger();

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
    logger.info(`[MCP-TRANSFORMER] Transforming parameters for tool: ${toolName}`, {
      toolName,
      rawParameters,
      userMessage
    });

    let transformedParams: ToolCallParameters = {};

    // Handle both prefixed and non-prefixed tool names
    const normalizedToolName = toolName.replace('servicenow-mcp:', '');

    switch (normalizedToolName) {
      case 'create-catalog-item':
        transformedParams = this.transformCatalogItemParams(rawParameters, userMessage);
        break;

      case 'create-incident':
        transformedParams = this.transformIncidentParams(rawParameters, userMessage);
        break;

      case 'query-records':
        transformedParams = this.transformQueryParams(rawParameters);
        break;

      case 'update-record':
        transformedParams = this.transformUpdateParams(rawParameters);
        break;

      case 'create-workflow':
        transformedParams = this.transformWorkflowParams(rawParameters, userMessage);
        break;

      default:
        // For unknown tools, pass parameters as-is
        transformedParams = rawParameters;
        break;
    }

    logger.info(`[MCP-TRANSFORMER] Transformed parameters:`, {
      toolName,
      transformedParams
    });

    return transformedParams;
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