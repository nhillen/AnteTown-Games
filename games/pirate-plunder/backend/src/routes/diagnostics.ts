import express, { Request, Response } from 'express';
import { UserService } from '../models/User';
import prisma from '../config/database';

const router = express.Router();

// Test database connection
router.get('/db-connection', async (req: Request, res: Response) => {
  try {
    await prisma.$connect();
    // Just test the connection without raw query to avoid BigInt serialization issues
    const userCount = await prisma.user.count();
    res.json({ 
      status: 'success', 
      message: 'Database connection successful',
      userCount
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test user creation (for testing purposes)
router.post('/create-test-user', async (req: Request, res: Response) => {
  try {
    const testUser = await UserService.create({
      googleId: `test_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      name: 'Test User',
      avatar: 'https://example.com/avatar.jpg'
    });

    res.json({
      status: 'success',
      message: 'Test user created',
      user: {
        id: testUser.id,
        name: testUser.name,
        email: testUser.email,
        bankroll: testUser.bankroll,
        cosmetics: testUser.cosmetics
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create test user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// List all users (for testing purposes)
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        bankroll: true,
        totalGamesPlayed: true,
        createdAt: true
      }
    });

    res.json({
      status: 'success',
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test session store
router.get('/session-info', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    sessionId: req.sessionID,
    isAuthenticated: req.isAuthenticated(),
    user: req.user ? {
      id: (req.user as any).id,
      name: (req.user as any).name
    } : null
  });
});

// Clean up test data
router.delete('/cleanup', async (req: Request, res: Response) => {
  try {
    const deleted = await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: 'test_'
        }
      }
    });

    res.json({
      status: 'success',
      message: `Deleted ${deleted.count} test users`
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to cleanup test data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;