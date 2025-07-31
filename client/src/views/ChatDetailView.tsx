import React, { useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatInterface from '../components/ChatInterface';
import ActivityPanel from '../components/ActivityPanel';
import { Socket } from 'socket.io-client';

interface OutletContext {
  socket: Socket | null;
  selectedModel: string;
}

function ChatDetailView() {
  const { chatId } = useParams();
  const { socket, selectedModel } = useOutletContext<OutletContext>();

  useEffect(() => {
    // TODO: Load chat history for this chatId
    console.log('Loading chat:', chatId);
  }, [chatId]);

  return (
    <>
      {/* Left sidebar - Quick Actions */}
      <div className="w-80 bg-surface border-r border-gray-700 flex-shrink-0">
        <Sidebar socket={socket} />
      </div>
      
      {/* Center - Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatInterface 
          socket={socket}
          selectedModel={selectedModel}
          chatId={chatId}
        />
      </div>
      
      {/* Right panel - Activity History */}
      <div className="w-80 bg-surface border-l border-gray-700 flex-shrink-0">
        <ActivityPanel socket={socket} />
      </div>
    </>
  );
}

export default ChatDetailView;