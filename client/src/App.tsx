import React, { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ActivityPanel from './components/ActivityPanel';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const socket = useWebSocket();

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <Header 
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        socket={socket}
      />
      
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Quick Actions */}
        <div className="w-80 bg-surface border-r border-gray-700 flex-shrink-0">
          <Sidebar socket={socket} />
        </div>
        
        {/* Center - Chat Interface */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatInterface 
            socket={socket}
            selectedModel={selectedModel}
          />
        </div>
        
        {/* Right panel - Activity History */}
        <div className="w-80 bg-surface border-l border-gray-700 flex-shrink-0">
          <ActivityPanel socket={socket} />
        </div>
      </div>
    </div>
  );
}

export default App;