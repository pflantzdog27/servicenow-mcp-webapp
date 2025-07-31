import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectSidebar } from '../components/project/ProjectSidebar';
import { FolderOpen, Plus, Bot, FileText, Users } from 'lucide-react';

function ProjectsView() {
  const navigate = useNavigate();
  const [triggerCreateProject, setTriggerCreateProject] = useState(false);

  const handleProjectSelect = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  return (
    <>
      {/* Left sidebar - Projects */}
      <ProjectSidebar 
        onProjectSelect={handleProjectSelect}
        triggerCreate={triggerCreateProject}
        onCreateTriggered={() => setTriggerCreateProject(false)}
      />
      
      {/* Center - Projects Landing Page */}
      <div className="flex-1 bg-gray-900 flex items-center justify-center">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <div className="mb-8">
            <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              NOWdev.ai Project Workspace
            </h1>
            <p className="text-xl text-gray-400 mb-8">
              Organize your ServiceNow development into projects with dedicated knowledge bases and context-aware AI assistance
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <Bot className="w-8 h-8 text-blue-400 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">AI-Powered Context</h3>
              <p className="text-sm text-gray-400">
                Each project maintains its own context and knowledge base for more relevant AI responses
              </p>
            </div>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <FileText className="w-8 h-8 text-green-400 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">Document Management</h3>
              <p className="text-sm text-gray-400">
                Upload and organize documentation that the AI will reference in project conversations
              </p>
            </div>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <Users className="w-8 h-8 text-purple-400 mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-white mb-2">Team Collaboration</h3>
              <p className="text-sm text-gray-400">
                Share projects and knowledge bases with your team for consistent ServiceNow operations
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <p className="text-gray-400 mb-6">
              Select a project from the sidebar or create a new one to get started
            </p>
            
            <div className="flex gap-4">
              <button
                onClick={() => setTriggerCreateProject(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Create New Project</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ProjectsView;