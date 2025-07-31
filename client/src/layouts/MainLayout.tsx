import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useWebSocket } from '../hooks/useWebSocket';

function MainLayout() {
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const socket = useWebSocket();
  const location = useLocation();
  const navigate = useNavigate();

  // Determine current view based on route
  const getCurrentView = (): 'chat' | 'projects' => {
    if (location.pathname.startsWith('/project')) {
      return 'projects';
    }
    return 'chat';
  };

  const handleViewChange = (view: 'chat' | 'projects') => {
    if (view === 'chat') {
      navigate('/');
    } else {
      navigate('/projects');
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header 
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        socket={socket}
        view={getCurrentView()}
        onViewChange={handleViewChange}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <Outlet context={{ socket, selectedModel }} />
      </div>
    </div>
  );
}

export default MainLayout;