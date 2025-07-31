import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { ChevronDown, User, LogOut, Settings, MessageCircle, FolderOpen, History } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface HeaderProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  socket: Socket | null;
  view: 'chat' | 'projects';
  onViewChange: (view: 'chat' | 'projects') => void;
}

const models = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { id: 'o1-mini', name: 'o1-mini', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
];

const Header: React.FC<HeaderProps> = ({ selectedModel, onModelChange, socket, view, onViewChange }) => {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const handleModelChange = (model: string) => {
    onModelChange(model);
    if (socket) {
      socket.emit('chat:select_model', { model });
    }
  };

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
  };

  const currentModel = models.find(m => m.id === selectedModel);

  return (
    <header className="bg-surface border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center space-x-6">
          <div className="flex flex-col items-start">
            <img 
              src="/assets/nowdev-logo.png" 
              alt="NOWdev.ai" 
              className="h-8 w-auto mb-1"
            />
            <p className="text-xs text-gray-400">AI-powered ServiceNow development</p>
          </div>
          
          {/* View Toggle */}
          <div className="flex items-center bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => onViewChange('chat')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'chat' && !location.pathname.includes('history')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-600'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => navigate('/history')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname.includes('history')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-600'
              }`}
            >
              <History className="w-4 h-4" />
              <span>History</span>
            </button>
            <button
              onClick={() => onViewChange('projects')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                view === 'projects'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-600'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Projects</span>
            </button>
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

        {/* Right side - Connection Status and User Menu */}
        <div className="flex items-center space-x-6">
          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${socket?.connected ? 'bg-success' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-400">
              {socket?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {/* User Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-surface-light transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-black" />
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-white">
                  {user?.name || user?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-surface border border-gray-600 rounded-lg shadow-xl z-50">
                <div className="px-4 py-3 border-b border-gray-600">
                  <p className="text-sm font-medium text-white">
                    {user?.name || 'ServiceNow User'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                
                <div className="py-2">
                  <button
                    onClick={() => setShowUserMenu(false)}
                    className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-surface-light hover:text-white transition-colors"
                  >
                    <Settings className="w-4 h-4 mr-3" />
                    Settings
                  </button>
                  
                  <div className="border-t border-gray-600 my-2" />
                  
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Click outside to close dropdown */}
      {showUserMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </header>
  );
};

export default Header;