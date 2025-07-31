import React, { useState } from 'react';
import { useProjects } from '../../contexts/ProjectContext';
import { MessageCircle, Search, Plus } from 'lucide-react';

interface ProjectChatViewProps {
  projectId?: string;
  documentId?: string;
  onBackToProjects: () => void;
}

export const ProjectChatView: React.FC<ProjectChatViewProps> = ({ projectId, documentId, onBackToProjects }) => {
  const { currentProject } = useProjects();
  const [message, setMessage] = useState('');


  if (!currentProject) {
    return (
      <div className="flex-1 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No project selected</p>
        </div>
      </div>
    );
  }

  const handleSendMessage = () => {
    if (!message.trim()) return;
    // TODO: Implement project-specific chat
    console.log('Sending message in project:', currentProject.name, message);
    setMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      {/* Project Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">{currentProject.name}</h1>
            {currentProject.description && (
              <p className="text-gray-400 mt-1">{currentProject.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              {/* Welcome Message */}
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  Chat with {currentProject.name}
                </h2>
                <p className="text-gray-400 mb-6">
                  Ask questions about your project documents or use ServiceNow tools in this project context.
                </p>
                
                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 justify-center">
                  <button className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors text-sm">
                    Summarize project documents
                  </button>
                  <button className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors text-sm">
                    Search project knowledge
                  </button>
                  <button className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors text-sm">
                    Create ServiceNow tickets
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Message Input */}
          <div className="border-t border-gray-700 p-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-end space-x-4">
                <div className="flex-1 relative">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="How can I help you with this project today?"
                    className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none min-h-[50px] max-h-32"
                    rows={1}
                  />
                  <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                    <button className="p-1 text-gray-400 hover:text-white transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-white transition-colors">
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!message.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>Ask questions, analyze documents, or execute ServiceNow operations</span>
                <span>Claude Sonnet 4</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};