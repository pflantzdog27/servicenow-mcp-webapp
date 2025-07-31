import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Bot, ChevronDown, User, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  socket: Socket | null;
}

const models = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { id: 'o4-mini-2025-04-16', name: 'GPT-o4 Mini', provider: 'OpenAI' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
];

const Header: React.FC<HeaderProps> = ({ selectedModel, onModelChange, socket }) => {
  const handleModelChange = (model: string) => {
    onModelChange(model);
    if (socket) {
      socket.emit('chat:select_model', { model });
    }
  };

  const currentModel = models.find(m => m.id === selectedModel);

  return (
    <header className="bg-surface border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
            <Bot className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">ServiceNow AI Assistant</h1>
            <p className="text-sm text-gray-400">Natural language ServiceNow operations</p>
          </div>
        </div>

        {/* Model Selector */}
        <div className="relative">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">AI Model:</span>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="appearance-none bg-surface-light border border-gray-600 rounded-lg px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:border-primary"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${socket?.connected ? 'bg-success' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {socket?.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;