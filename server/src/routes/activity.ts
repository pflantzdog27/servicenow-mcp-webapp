import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { ActivityService } from '../services/activity';
import { createLogger } from '../utils/logger';

const router = express.Router();
const activityService = new ActivityService();
const logger = createLogger();

// GET /api/activity - Get user's activity history
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const activities = await activityService.getUserActivity(req.user.userId, limit, offset);
    
    res.json({ activities });
  } catch (error) {
    logger.error('Get activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/activity/stats - Get user's activity statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const stats = await activityService.getUserActivityStats(req.user.userId);
    
    res.json({ stats });
  } catch (error) {
    logger.error('Get activity stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;