import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import { documentService } from '../services/document';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      // Future: 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Supported types: .txt, .md, .json'));
    }
  },
});

// Upload document to project
router.post('/:projectId/upload', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const document = await documentService.uploadDocument(projectId, userId, {
      originalName: file.originalname,
      contentType: file.mimetype,
      fileSize: file.size,
      buffer: file.buffer,
    });

    res.status(201).json(document);
  } catch (error) {
    logger.error('Error uploading document:', error);
    
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      }
    }

    if (error instanceof Error && error.message.includes('Unsupported file type')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Get documents for a project
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;

    const documents = await documentService.getProjectDocuments(projectId, userId);
    res.json(documents);
  } catch (error) {
    logger.error('Error fetching project documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Delete a document
router.delete('/:documentId', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.userId;

    await documentService.deleteDocument(documentId, userId);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Search content within a project
router.post('/:projectId/search', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { query, limit = 5 } = req.body;
    const userId = req.user!.userId;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await documentService.searchSimilarContent(
      query.trim(),
      projectId,
      userId,
      Math.min(parseInt(limit), 20) // Cap at 20 results
    );

    res.json(results);
  } catch (error) {
    logger.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// Handle multer errors
router.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }

  if (error.message.includes('Unsupported file type')) {
    return res.status(400).json({ error: error.message });
  }

  next(error);
});

export default router;