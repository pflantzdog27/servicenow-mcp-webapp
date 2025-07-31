import { authFetch } from './auth';

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  documents?: Document[];
  chatSessions?: ChatSession[];
  _count?: {
    documents: number;
    chatSessions: number;
  };
}

export interface Document {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  contentType: string;
  fileSize: number;
  content?: string;
  chunkCount: number;
  processingStatus: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

export interface CreateProjectData {
  name: string;
  description?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding?: string;
  createdAt: string;
  document: {
    originalName: string;
    contentType: string;
  };
}

export class ProjectService {
  async createProject(data: CreateProjectData): Promise<Project> {
    const response = await authFetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create project');
    }

    return response.json();
  }

  async getProjects(): Promise<Project[]> {
    const response = await authFetch('/api/projects');

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch projects');
    }

    return response.json();
  }

  async getProject(id: string): Promise<Project> {
    const response = await authFetch(`/api/projects/${id}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch project');
    }

    return response.json();
  }

  async updateProject(id: string, data: UpdateProjectData): Promise<Project> {
    const response = await authFetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update project');
    }

    return response.json();
  }

  async deleteProject(id: string): Promise<void> {
    const response = await authFetch(`/api/projects/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete project');
    }
  }

  async uploadDocument(projectId: string, file: File): Promise<Document> {
    const formData = new FormData();
    formData.append('document', file);

    const response = await authFetch(`/api/documents/${projectId}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload document');
    }

    return response.json();
  }

  async getProjectDocuments(projectId: string): Promise<Document[]> {
    const response = await authFetch(`/api/documents/${projectId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch documents');
    }

    return response.json();
  }

  async deleteDocument(documentId: string): Promise<void> {
    const response = await authFetch(`/api/documents/${documentId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete document');
    }
  }

  async searchDocuments(projectId: string, query: string, limit: number = 5): Promise<DocumentChunk[]> {
    const response = await authFetch(`/api/documents/${projectId}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to search documents');
    }

    return response.json();
  }
}

export const projectService = new ProjectService();