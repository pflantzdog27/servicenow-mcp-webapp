import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project, projectService } from '../services/projects';
import { useAuth } from './AuthContext';

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  error: string | null;
  createProject: (name: string, description?: string) => Promise<void>;
  selectProject: (project: Project | null) => void;
  refreshProjects: () => Promise<void>;
  updateProject: (id: string, name?: string, description?: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProjects = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};

interface ProjectProviderProps {
  children: ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const refreshProjects = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const fetchedProjects = await projectService.getProjects();
      setProjects(fetchedProjects);
      
      // Don't auto-select any project - let user choose explicitly
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (name: string, description?: string) => {
    setError(null);
    try {
      const newProject = await projectService.createProject({ name, description });
      setProjects(prev => [newProject, ...prev]);
      setCurrentProject(newProject);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      throw err;
    }
  };

  const selectProject = (project: Project | null) => {
    setCurrentProject(project);
  };

  const updateProject = async (id: string, name?: string, description?: string) => {
    setError(null);
    try {
      const updatedProject = await projectService.updateProject(id, { name, description });
      setProjects(prev => prev.map(p => p.id === id ? updatedProject : p));
      
      if (currentProject?.id === id) {
        setCurrentProject(updatedProject);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
      throw err;
    }
  };

  const deleteProject = async (id: string) => {
    setError(null);
    try {
      await projectService.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      
      if (currentProject?.id === id) {
        setCurrentProject(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      throw err;
    }
  };

  useEffect(() => {
    if (user) {
      refreshProjects();
    } else {
      setProjects([]);
      setCurrentProject(null);
    }
  }, [user]);

  const value: ProjectContextType = {
    projects,
    currentProject,
    loading,
    error,
    createProject,
    selectProject,
    refreshProjects,
    updateProject,
    deleteProject,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};