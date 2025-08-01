import React from 'react';
import { useOutletContext } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import EnhancedChatInterface from '../components/NewEnhancedChatInterface';
import ActivityPanel from '../components/ActivityPanel';
import DebugStatusPanel from '../components/DebugStatusPanel';
import { Socket } from 'socket.io-client';

interface OutletContext {
  socket: Socket | null;
  selectedModel: string;
}

function ChatView() {
  const { socket, selectedModel } = useOutletContext<OutletContext>();

  return (
    <>
      {/* Left sidebar - Quick Actions */}
      <div className="w-80 bg-surface border-r border-gray-700 flex-shrink-0">
        <Sidebar socket={socket} />
      </div>
      
      {/* Center - Enhanced Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0">
        <EnhancedChatInterface 
          socket={socket}
          selectedModel={selectedModel}
        />
      </div>
      
      {/* Right panel - Activity History */}
      <div className="w-80 bg-surface border-l border-gray-700 flex-shrink-0">
        <ActivityPanel socket={socket} />
      </div>
      
      {/* Debug Status Panel (floating) */}
      <DebugStatusPanel socket={socket} selectedModel={selectedModel} />
    </>
  );
}

export default ChatView;