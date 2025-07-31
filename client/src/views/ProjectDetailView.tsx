import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectDetailSidebar } from '../components/project/ProjectDetailSidebar';
import { ProjectChatView } from '../components/project/ProjectChatView';

function ProjectDetailView() {
  const { projectId, documentId } = useParams();
  const navigate = useNavigate();

  const handleBackToProjects = () => {
    navigate('/projects');
  };

  return (
    <>
      {/* Left sidebar - Project chat history and documents */}
      <ProjectDetailSidebar onBackToProjects={handleBackToProjects} />
      
      {/* Main chat area */}
      <ProjectChatView 
        projectId={projectId}
        documentId={documentId}
        onBackToProjects={handleBackToProjects} 
      />
    </>
  );
}

export default ProjectDetailView;