import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { projectService } from '../services/project';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user!.userId;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = await projectService.createProject(userId, {
      name: name.trim(),
      description: description?.trim(),
    });

    res.status(201).json(project);
  } catch (error) {
    logger.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const projects = await projectService.getUserProjects(userId);
    res.json(projects);
  } catch (error) {
    logger.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const project = await projectService.getProject(id, userId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    logger.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.userId;

    if (name && name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name cannot be empty' });
    }

    const project = await projectService.updateProject(id, userId, {
      name: name?.trim(),
      description: description?.trim(),
    });

    res.json(project);
  } catch (error) {
    logger.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    await projectService.deleteProject(id, userId);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;