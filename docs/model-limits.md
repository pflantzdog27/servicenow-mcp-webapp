# Model Context and Token Limits (2025)

## Overview

This document outlines the current token and context limits for various LLM models as of 2025, which will be used to implement context limit warnings in our application.

## OpenAI Models

### GPT-4 Series
- **GPT-4**: 8,192 tokens context window, 4,096 max output
- **GPT-4 Turbo**: 128,000 tokens context window, 4,096 max output
- **GPT-4.1**: 1,000,000 tokens context window, 32,768 max output

### GPT-4o Series
- **GPT-4o**: 128,000 tokens context window, 16,384 max output
- **GPT-4o mini**: 128,000 tokens context window, 16,384 max output

### GPT-3.5 Series
- **GPT-3.5-turbo**: 16,384 tokens context window, 4,096 max output

### O1 Series (Reasoning Models)
- **o1-mini**: 128,000 tokens context window, 65,536 max output
- **o4-mini**: 128,000 tokens context window, 100,000 max output

## Anthropic Claude Models

### Claude 3 Family
All Claude 3 models share:
- **Context Window**: 200,000 tokens
- **Max Output**: 4,096 tokens (Claude 3), 8,192 tokens (Claude 3.5)

### Claude 3.7
- **Claude 3.7 Sonnet**: 200,000 tokens context, up to 128,000 output (with beta header)

### Claude 4 Family (Latest 2025)
- **Claude 4 Opus**: 200,000 tokens context, 32,000 max output
- **Claude 4 Sonnet**: 200,000 tokens context, 64,000 max output

## Implementation Guidelines

### Context Tracking
1. Track total tokens used in conversation (input + output)
2. Warn users at 80% of context limit
3. Prevent sending requests that exceed context limit

### Token Calculation
- Use tiktoken library for OpenAI models
- Use Anthropic's token counting for Claude models
- Rough estimate: 1 token ≈ 4 characters or 0.75 words

### Warning Thresholds
```javascript
const WARNING_THRESHOLDS = {
  80: 'yellow',  // 80% - Warning
  90: 'orange',  // 90% - Strong warning
  95: 'red'      // 95% - Critical warning
};
```

### Context Management Strategies
1. **Summarization**: Summarize older messages when approaching limit
2. **Pruning**: Remove non-essential messages from context
3. **New Chat**: Suggest starting a new chat when limit reached
4. **Export**: Allow users to export chat history before clearing

## Cost Considerations

### OpenAI Pricing (per million tokens)
- GPT-4: $30 input / $60 output
- GPT-4o: $2.50 input / $10 output
- GPT-4o mini: $0.15 input / $0.60 output
- GPT-3.5-turbo: $0.50 input / $1.50 output

### Anthropic Pricing (per million tokens)
- Claude 3 Haiku: $0.25 input / $1.25 output
- Claude 3.5 Haiku: $0.80 input / $4.00 output
- Claude 3/3.5/3.7 Sonnet: $3.00 input / $15.00 output
- Claude 3/4 Opus: $15.00 input / $75.00 output

## Database Schema for Token Tracking

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  model VARCHAR(50),
  total_tokens_used INTEGER DEFAULT 0,
  context_limit INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id),
  role VARCHAR(20),
  content TEXT,
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```