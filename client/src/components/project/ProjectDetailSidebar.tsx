import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, FileText, Plus, Calendar, Search } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  lastMessage: Date;
  messageCount: number;
}

interface ProjectDetailSidebarProps {
  onBackToProjects: () => void;
}

export const ProjectDetailSidebar: React.FC<ProjectDetailSidebarProps> = ({ onBackToProjects }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'chat' | 'documents'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mock chat sessions for this project - in real app, fetch from backend
  const chatSessions: ChatSession[] = [];

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center space-x-3 mb-4">
          <button
            onClick={onBackToProjects}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center text-sm text-gray-400 mb-1">
              <button onClick={onBackToProjects} className="hover:text-white transition-colors">
                All projects
              </button>
            </div>
            <h2 className="text-lg font-semibold text-white">Project Chat</h2>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-600'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>History</span>
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'documents'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-600'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Docs</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chat' ? (
          <div className="p-4">
            {chatSessions.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm mb-2">No chat history yet</p>
                <p className="text-xs text-gray-500">
                  Start a conversation in this project to see your chat history here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {chatSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => navigate(`/project/${projectId}/chat/${session.id}`)}
                    className="w-full p-3 text-left bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <h4 className="font-medium text-white text-sm truncate mb-1">
                      {session.title}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                      {session.preview}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center">
                        <MessageCircle className="w-3 h-3 mr-1" />
                        {session.messageCount}
                      </span>
                      <span>{formatDate(session.lastMessage)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="text-center text-gray-400 py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm mb-2">No documents yet</p>
              <p className="text-xs text-gray-500 mb-4">
                Upload documents to this project's knowledge base
              </p>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center space-x-2 mx-auto">
                <Plus className="w-4 h-4" />
                <span>Upload</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};