import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { ChatService } from '../services/chat';
import { createLogger } from '../utils/logger';

const router = express.Router();
const chatService = new ChatService();
const logger = createLogger();

// GET /api/chats - Get user's chat sessions
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const sessions = await chatService.getUserSessions(req.user.userId, limit, offset);
    
    res.json({ sessions });
  } catch (error) {
    logger.error('Get chat sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/chats/:sessionId - Get specific chat session with messages
router.get('/:sessionId', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;

    const session = await chatService.getSessionWithMessages(sessionId, req.user.userId);
    
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({ session });
  } catch (error) {
    logger.error('Get chat session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/chats - Create new chat session
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { title, model } = req.body;

    const session = await chatService.createSession(req.user.userId, {
      title: title || 'New Chat',
      model: model || 'claude-3-5-sonnet-20241022'
    });
    
    res.status(201).json({ session });
  } catch (error) {
    logger.error('Create chat session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/chats/:sessionId - Update chat session (e.g., title)
router.put('/:sessionId', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;
    const { title } = req.body;

    const session = await chatService.updateSession(sessionId, req.user.userId, { title });
    
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({ session });
  } catch (error) {
    logger.error('Update chat session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/chats/:sessionId - Delete chat session
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { sessionId } = req.params;

    const deleted = await chatService.deleteSession(sessionId, req.user.userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json({ message: 'Chat session deleted successfully' });
  } catch (error) {
    logger.error('Delete chat session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;