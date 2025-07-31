import React, { useState, useEffect } from 'react';
import { useProjects } from '../../contexts/ProjectContext';
import { Plus, Folder, FolderOpen, FileText, MessageCircle, MoreVertical, Edit2, Trash2 } from 'lucide-react';

interface ProjectSidebarProps {
  onProjectSelect?: (projectId: string) => void;
  triggerCreate?: boolean;
  onCreateTriggered?: () => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ onProjectSelect, triggerCreate, onCreateTriggered }) => {
  const {
    projects,
    currentProject,
    loading,
    error,
    createProject,
    selectProject,
    updateProject,
    deleteProject,
  } = useProjects();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    if (triggerCreate) {
      setShowCreateForm(true);
      onCreateTriggered?.();
    }
  }, [triggerCreate, onCreateTriggered]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) return;

    try {
      if (editingProject) {
        await updateProject(editingProject, formData.name.trim(), formData.description.trim() || undefined);
        setEditingProject(null);
      } else {
        await createProject(formData.name.trim(), formData.description.trim() || undefined);
        setShowCreateForm(false);
      }
      setFormData({ name: '', description: '' });
    } catch (err) {
      console.error('Project operation failed:', err);
    }
  };

  const handleEdit = (project: any) => {
    setEditingProject(project.id);
    setFormData({ name: project.name, description: project.description || '' });
    setActionMenuOpen(null);
  };

  const handleDelete = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        await deleteProject(projectId);
      } catch (err) {
        console.error('Delete failed:', err);
      }
    }
    setActionMenuOpen(null);
  };

  const handleCancel = () => {
    setShowCreateForm(false);
    setEditingProject(null);
    setFormData({ name: '', description: '' });
  };

  if (loading) {
    return (
      <div className="w-80 bg-gray-800 border-r border-gray-700 p-4">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Create new project"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="text-red-400 text-sm mb-4 p-2 bg-red-900/20 rounded">
            {error}
          </div>
        )}

        {(showCreateForm || editingProject) && (
          <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-gray-700 rounded-lg mb-4">
            <input
              type="text"
              placeholder="Project name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-600 text-white rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
              required
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-600 text-white rounded border border-gray-500 focus:border-blue-500 focus:outline-none resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
              >
                {editingProject ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No projects yet</p>
            <p className="text-xs mt-1">Create your first project to get started</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
                  currentProject?.id === project.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                onClick={() => {
                  selectProject(project);
                  onProjectSelect?.(project.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {currentProject?.id === project.id ? (
                      <FolderOpen className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <Folder className="w-5 h-5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{project.name}</div>
                      {project.description && (
                        <div className="text-xs opacity-75 truncate mt-0.5">
                          {project.description}
                        </div>
                      )}
                      <div className="flex items-center space-x-4 text-xs opacity-75 mt-1">
                        {project._count && (
                          <>
                            <span className="flex items-center space-x-1">
                              <FileText className="w-3 h-3" />
                              <span>{project._count.documents}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <MessageCircle className="w-3 h-3" />
                              <span>{project._count.chatSessions}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenuOpen(actionMenuOpen === project.id ? null : project.id);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-600 rounded transition-all"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    
                    {actionMenuOpen === project.id && (
                      <div className="absolute right-0 top-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(project);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white flex items-center space-x-2 first:rounded-t-lg"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(project.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-600 hover:text-white flex items-center space-x-2 last:rounded-b-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};