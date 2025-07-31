import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthWrapper from './components/auth/AuthWrapper';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import MainLayout from './layouts/MainLayout';
import ChatView from './views/ChatView';
import ProjectsView from './views/ProjectsView';
import ProjectDetailView from './views/ProjectDetailView';
import ChatHistoryView from './views/ChatHistoryView';
import ChatDetailView from './views/ChatDetailView';

function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <Router>
          <Routes>
            {/* Auth routes */}
            <Route path="/login" element={<LoginForm />} />
            <Route path="/register" element={<RegisterForm />} />
            
            {/* Protected routes */}
            <Route path="/" element={<AuthWrapper />}>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<ChatView />} />
                <Route path="chat" element={<ChatView />} />
                <Route path="chat/:chatId" element={<ChatDetailView />} />
                <Route path="history" element={<ChatHistoryView />} />
                <Route path="projects" element={<ProjectsView />} />
                <Route path="project/:projectId" element={<ProjectDetailView />} />
                <Route path="project/:projectId/document/:documentId" element={<ProjectDetailView />} />
              </Route>
            </Route>
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ProjectProvider>
    </AuthProvider>
  );
}

export default App;