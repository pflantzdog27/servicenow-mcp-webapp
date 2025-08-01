export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export const models: ModelInfo[] = [
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'Anthropic' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'Anthropic' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7', provider: 'Anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5', provider: 'Anthropic' },
  // Add more models as needed
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5', provider: 'OpenAI' },
  { id: 'o4-mini', name: 'O4-Mini', provider: 'OpenAI' },
];

/**
 * Get human-readable name for a model ID
 */
export function getModelDisplayName(modelId: string): string {
  const model = models.find(m => m.id === modelId);
  return model ? model.name : modelId;
}

/**
 * Get model info including provider
 */
export function getModelInfo(modelId: string): ModelInfo | null {
  return models.find(m => m.id === modelId) || null;
}

/**
 * Get clean model name without provider suffix for dropdowns
 */
export function getCleanModelName(modelId: string): string {
  const model = models.find(m => m.id === modelId);
  return model ? model.name : modelId;
}