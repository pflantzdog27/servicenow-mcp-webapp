import { ConversationContext, CreatedItem, UserIntent } from '../types/conversation';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface ValidationResult {
  valid: boolean;
  suggestion?: string;
  recommendedAction?: string;
}

export interface SelectedTool {
  name: string;
  arguments?: any;
}

export class ConversationFlowValidator {
  /**
   * Validates tool selection against conversation context to prevent loops and mismatched intents
   */
  validateToolSelection(
    selectedTools: SelectedTool[],
    context: ConversationContext,
    userMessage: string
  ): ValidationResult {
    // Check if we're about to repeat a recently completed action
    const recentTools = this.getRecentToolExecutions(context);
    
    // Prevent creation loops
    if (this.isCreationLoop(selectedTools, recentTools, userMessage, context)) {
      return {
        valid: false,
        suggestion: 'User may be referring to existing item, not requesting creation',
        recommendedAction: 'query_existing'
      };
    }
    
    // Validate intent matches tool selection
    const intent = this.analyzeIntent(userMessage, context);
    if (!this.intentMatchesTools(intent, selectedTools)) {
      return {
        valid: false,
        suggestion: `Intent mismatch: detected ${intent} but tools suggest ${this.getToolIntent(selectedTools)}`,
        recommendedAction: this.getRecommendedAction(intent)
      };
    }
    
    // Check for repeated UI policy or variable creation prompts
    if (this.isRepetitiveWorkflowPrompt(selectedTools, context)) {
      return {
        valid: false,
        suggestion: 'This workflow step was already offered or completed',
        recommendedAction: 'skip_workflow_step'
      };
    }
    
    return { valid: true };
  }
  
  private getRecentToolExecutions(context: ConversationContext): string[] {
    // Extract tool names from recent messages (last 5 assistant messages)
    const recentAssistantMessages = context.messages
      .filter(m => m.role === 'assistant')
      .slice(-5);
    
    const toolNames: string[] = [];
    recentAssistantMessages.forEach(msg => {
      if (msg.toolInvocations) {
        msg.toolInvocations.forEach((invocation: any) => {
          if (invocation.name) {
            toolNames.push(invocation.name);
          }
        });
      }
    });
    
    return toolNames;
  }
  
  private isCreationLoop(
    selectedTools: SelectedTool[],
    recentTools: string[],
    userMessage: string,
    context: ConversationContext
  ): boolean {
    // Check if user is referring to existing items
    const referencePatterns = [
      /\b(this|that|it|the) (item|catalog|incident|request|record)/i,
      /\b(does|is) (this|that|it)/i,
      /\bfor (this|that|it)/i,
      /\bthe one (we |I )?(just )?(created|made)/i
    ];
    
    const isReferencing = referencePatterns.some(p => p.test(userMessage));
    
    // If user is referencing something and we have created items
    if (isReferencing && context.serviceNowContext.createdItems.length > 0) {
      // Check if selected tools include creation tools
      const creationTools = selectedTools.filter(t => 
        t.name.includes('create') && !t.name.includes('variable') && !t.name.includes('policy')
      );
      
      if (creationTools.length > 0) {
        logger.warn('🔄 Detected potential creation loop - user is referring to existing items');
        return true;
      }
    }
    
    // Check if we're repeatedly suggesting the same creation
    const catalogCreationCount = recentTools.filter(t => t.includes('create-catalog-item')).length;
    const isCreatingCatalog = selectedTools.some(t => t.name.includes('create-catalog-item'));
    
    if (catalogCreationCount >= 2 && isCreatingCatalog) {
      logger.warn('🔄 Detected repeated catalog item creation suggestions');
      return true;
    }
    
    return false;
  }
  
  private analyzeIntent(message: string, context: ConversationContext): UserIntent {
    const lowercaseMessage = message.toLowerCase();
    
    // Query patterns
    if (/find (the )?(existing|current|my|all)/i.test(message) ||
        /search for .* (created|existing)/i.test(message) ||
        /query (the )?(catalog|items|records)/i.test(message) ||
        /what .* (created|have|exist)/i.test(message) ||
        /show me (the )?(existing|current|all)/i.test(message)) {
      return 'query';
    }
    
    // Reference patterns
    if (context.serviceNowContext.createdItems.length > 0) {
      if (/\b(this|that|it|the) (item|catalog|incident|request|record)/i.test(message) ||
          /\b(does|is) (this|that|it)/i.test(message)) {
        return 'reference_existing';
      }
    }
    
    // Create patterns
    if (/create (a )?(new|another)/i.test(message) ||
        /add (a )?(new)/i.test(message) ||
        /make (a )?(new)/i.test(message)) {
      return 'create';
    }
    
    return context.serviceNowContext.lastIntent || null;
  }
  
  private intentMatchesTools(intent: UserIntent, selectedTools: SelectedTool[]): boolean {
    if (!intent || selectedTools.length === 0) return true;
    
    const toolIntents = selectedTools.map(t => this.getToolIntentType(t.name));
    
    switch (intent) {
      case 'query':
      case 'reference_existing':
        // Should not have creation tools (except variables/policies for existing items)
        return !toolIntents.some(ti => ti === 'create_new');
        
      case 'create':
        // Should have at least one creation tool
        return toolIntents.some(ti => ti === 'create_new' || ti === 'create_related');
        
      default:
        return true;
    }
  }
  
  private getToolIntentType(toolName: string): string {
    if (toolName.includes('query') || toolName.includes('get') || toolName.includes('search')) {
      return 'query';
    }
    
    if (toolName.includes('create')) {
      // Variables and policies are related to existing items
      if (toolName.includes('variable') || toolName.includes('policy')) {
        return 'create_related';
      }
      return 'create_new';
    }
    
    if (toolName.includes('update') || toolName.includes('modify')) {
      return 'update';
    }
    
    return 'unknown';
  }
  
  private getToolIntent(selectedTools: SelectedTool[]): string {
    const intents = selectedTools.map(t => this.getToolIntentType(t.name));
    const uniqueIntents = [...new Set(intents)];
    return uniqueIntents.join(', ');
  }
  
  private getRecommendedAction(intent: UserIntent): string {
    switch (intent) {
      case 'query':
        return 'use_query_tools';
      case 'reference_existing':
        return 'get_existing_item';
      case 'create':
        return 'use_creation_tools';
      default:
        return 'clarify_intent';
    }
  }
  
  private isRepetitiveWorkflowPrompt(
    selectedTools: SelectedTool[],
    context: ConversationContext
  ): boolean {
    // Check if we've already completed similar workflow steps
    const completedSteps = context.serviceNowContext.workflowSteps
      .filter(step => step.completed)
      .map(step => step.step);
    
    // Check if we're suggesting tools that were already completed
    for (const tool of selectedTools) {
      if (completedSteps.some(step => step.includes(tool.name))) {
        logger.warn(`🔄 Tool ${tool.name} was already completed in this workflow`);
        return true;
      }
    }
    
    // Check for repeated UI policy/variable prompts in messages
    const recentMessages = context.messages.slice(-5);
    const uiPolicyPromptCount = recentMessages.filter(m => 
      m.content.toLowerCase().includes('ui policy') && 
      m.content.toLowerCase().includes('would you like')
    ).length;
    
    if (uiPolicyPromptCount >= 2 && selectedTools.some(t => t.name.includes('ui-policy'))) {
      logger.warn('🔄 Detected repeated UI policy creation prompts');
      return true;
    }
    
    return false;
  }
}

// Export types for use in other modules
export type { ConversationContext, CreatedItem, UserIntent } from '../types/conversation';