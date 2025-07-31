import React, { useState, useRef, useCallback } from 'react';
import { useProjects } from '../../contexts/ProjectContext';
import { projectService, Document } from '../../services/projects';
import { Upload, FileText, Loader, AlertCircle, Trash2, Download } from 'lucide-react';

export const DocumentPanel: React.FC = () => {
  const { currentProject, refreshProjects } = useProjects();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    if (!currentProject) return;

    setLoading(true);
    setError(null);
    try {
      const docs = await projectService.getProjectDocuments(currentProject.id);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  React.useEffect(() => {
    if (currentProject) {
      loadDocuments();
    } else {
      setDocuments([]);
    }
  }, [currentProject, loadDocuments]);

  const handleFileUpload = async (files: FileList) => {
    if (!currentProject || files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const uploadPromises = Array.from(files).map(file => 
        projectService.uploadDocument(currentProject.id, file)
      );

      await Promise.all(uploadPromises);
      await loadDocuments();
      await refreshProjects(); // Update project document counts
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload documents');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    try {
      await projectService.deleteDocument(documentId);
      await loadDocuments();
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: Document['processingStatus']) => {
    switch (status) {
      case 'COMPLETED': return 'text-green-400';
      case 'PROCESSING': return 'text-yellow-400';
      case 'UPLOADING': return 'text-blue-400';
      case 'FAILED': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status: Document['processingStatus']) => {
    switch (status) {
      case 'COMPLETED': return 'Ready';
      case 'PROCESSING': return 'Processing...';
      case 'UPLOADING': return 'Uploading...';
      case 'FAILED': return 'Failed';
      default: return 'Unknown';
    }
  };

  if (!currentProject) {
    return (
      <div className="flex-1 bg-gray-900 p-6 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to manage documents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-900 flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Documents</h3>
            <p className="text-sm text-gray-400">{currentProject.name}</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
          >
            {uploading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>{uploading ? 'Uploading...' : 'Upload'}</span>
          </button>
        </div>

        {error && (
          <div className="text-red-400 text-sm p-3 bg-red-900/20 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.json"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <Loader className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : documents.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`m-6 border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragOver 
                ? 'border-blue-400 bg-blue-400/10' 
                : 'border-gray-600 hover:border-gray-500'
            }`}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-400 mb-2">No documents uploaded yet</p>
            <p className="text-sm text-gray-500 mb-4">
              Drag and drop files here, or click the upload button
            </p>
            <p className="text-xs text-gray-500">
              Supported formats: .txt, .md, .json
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white truncate">{doc.originalName}</h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-400 mt-1">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span className={getStatusColor(doc.processingStatus)}>
                          {getStatusText(doc.processingStatus)}
                        </span>
                        {doc.chunkCount > 0 && (
                          <span>{doc.chunkCount} chunks</span>
                        )}
                      </div>
                      {doc.errorMessage && (
                        <div className="text-red-400 text-sm mt-2 flex items-center space-x-2">
                          <AlertCircle className="w-4 h-4" />
                          <span>{doc.errorMessage}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};