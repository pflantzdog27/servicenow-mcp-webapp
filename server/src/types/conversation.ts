export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: any[];
  timestamp: Date;
}

export interface CreatedItem {
  type: string; // 'catalog_item', 'ui_policy', 'incident', etc.
  sys_id: string;
  name: string;
  created_at: Date;
}

export interface WorkflowStep {
  step: string;
  completed: boolean;
  result?: any;
}

export type UserIntent = 'create' | 'query' | 'update' | 'delete' | 'reference_existing' | null;

export interface ConversationContext {
  messages: Message[];
  lastToolUse: Date | null;
  serviceNowContext: {
    recentRecords: string[];
    currentWorkflow: string | null;
    createdItems: CreatedItem[];
    lastIntent: UserIntent;
    workflowSteps: WorkflowStep[];
  };
  dbSessionId?: string;
}