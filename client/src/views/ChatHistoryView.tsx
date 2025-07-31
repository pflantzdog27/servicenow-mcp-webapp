import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { MessageSquare, Calendar, Search } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface OutletContext {
  socket: Socket | null;
  selectedModel: string;
}

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  lastMessage: Date;
  messageCount: number;
}

function ChatHistoryView() {
  const navigate = useNavigate();
  const { socket } = useOutletContext<OutletContext>();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch chat history from backend
    // No demo data - start with empty state
    setTimeout(() => {
      setSessions([]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="flex-1 flex">
      {/* Left sidebar - Chat list */}
      <div className="w-96 bg-surface border-r border-gray-700 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Chat History</h2>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">Loading...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              {searchQuery ? 'No conversations found' : 'No chat history yet'}
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/chat/${session.id}`)}
                  className="w-full p-4 hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-white truncate flex-1 mr-2">
                      {session.title}
                    </h3>
                    <span className="text-sm text-gray-400 whitespace-nowrap">
                      {formatDate(session.lastMessage)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                    {session.preview}
                  </p>
                  <div className="flex items-center text-xs text-gray-500">
                    <MessageSquare className="w-3 h-3 mr-1" />
                    {session.messageCount} messages
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center - Welcome/Empty state */}
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Your Chat History</h2>
          <p className="text-gray-400 max-w-md">
            Select a conversation from the left to view it, or start a new chat
            to begin interacting with ServiceNow.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
          >
            Start New Chat
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatHistoryView;