import React, { useState } from 'react';
import { Settings, TestTube, Zap, Bug } from 'lucide-react';
import TestChecklistPanel from './TestChecklistPanel';
import DeveloperToolsPanel from './DeveloperToolsPanel';
import TestPromptsPanel from './TestPromptsPanel';

interface DevToolsIntegrationProps {
  socket: any;
  onSendMessage: (message: string) => void;
}

const DevToolsIntegration: React.FC<DevToolsIntegrationProps> = ({ socket, onSendMessage }) => {
  const [activePanel, setActivePanel] = useState<string | null>(null);

  const openPanel = (panelType: string) => {
    setActivePanel(panelType);
  };

  const closePanel = () => {
    setActivePanel(null);
  };

  // Don't show in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <>
      {/* Floating Developer Tools Button */}
      <div className="fixed bottom-4 left-4 z-30">
        <div className="flex flex-col space-y-2">
          <button
            onClick={() => openPanel('test-checklist')}
            className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors duration-200"
            title="Run Test Checklist"
          >
            <TestTube className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => openPanel('test-prompts')}
            className="bg-green-600 text-white p-3 rounded-full shadow-lg hover:bg-green-700 transition-colors duration-200"
            title="Test Prompts"
          >
            <Zap className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => openPanel('dev-tools')}
            className="bg-purple-600 text-white p-3 rounded-full shadow-lg hover:bg-purple-700 transition-colors duration-200"
            title="Developer Tools"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Panel Overlays */}
      {activePanel === 'test-checklist' && (
        <TestChecklistPanel
          socket={socket}
          onClose={closePanel}
        />
      )}

      {activePanel === 'test-prompts' && (
        <TestPromptsPanel
          onSendMessage={onSendMessage}
          onClose={closePanel}
        />
      )}

      {activePanel === 'dev-tools' && (
        <DeveloperToolsPanel
          socket={socket}
          onClose={closePanel}
        />
      )}
    </>
  );
};

export default DevToolsIntegration;