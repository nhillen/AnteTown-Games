import express, { Request, Response } from 'express';
import passport from '../config/passport';
import { UserProfile, UserService } from '../models/User';

const router = express.Router();

// Google OAuth login
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
const frontendUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : process.env.FRONTEND_URL;

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${frontendUrl}/` }),
  (req: Request, res: Response) => {
    // Redirect to frontend - the SPA will handle authentication state
    res.redirect(`${frontendUrl}/`);
  }
);

// Get current user
router.get('/user', (req: Request, res: Response) => {
  if (req.isAuthenticated()) {
    const user = req.user as UserProfile;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      bankroll: user.bankroll,
      cosmetics: user.cosmetics,
      unlockedCosmetics: user.unlockedCosmetics,
      totalGamesPlayed: user.totalGamesPlayed,
      totalWinnings: user.totalWinnings,
      isAdmin: user.isAdmin
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Update user profile
router.put('/profile', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = req.user as UserProfile;
    const { name, cosmetics } = req.body;

    if (cosmetics) {
      // Validate that user has unlocked the cosmetics they're trying to use
      for (const [key, value] of Object.entries(cosmetics)) {
        if (value && !user.unlockedCosmetics.includes(value as string)) {
          return res.status(400).json({ 
            error: `Cosmetic '${value}' for ${key} is not unlocked` 
          });
        }
      }
    }

    const updatedUser = await UserService.updateProfile(user.id, { name, cosmetics });
    
    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      cosmetics: updatedUser.cosmetics,
      unlockedCosmetics: updatedUser.unlockedCosmetics
    });
  } catch (error) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// Purchase cosmetic item
router.post('/purchase-cosmetic', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = req.user as UserProfile;
    const { itemId, price } = req.body;

    if (!itemId || typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ error: 'Invalid item or price' });
    }

    const updatedUser = await UserService.purchaseCosmetic(user.id, itemId, price);
    
    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      bankroll: updatedUser.bankroll,
      cosmetics: updatedUser.cosmetics,
      unlockedCosmetics: updatedUser.unlockedCosmetics,
      totalGamesPlayed: updatedUser.totalGamesPlayed,
      totalWinnings: updatedUser.totalWinnings
    });
  } catch (error: any) {
    console.error('Cosmetic purchase error:', error);
    res.status(400).json({ error: error.message || 'Purchase failed' });
  }
});

// Set admin status (development/setup endpoint)
router.post('/set-admin/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    
    // Only allow setting nhillen@gmail.com as admin for security
    if (email !== 'nhillen@gmail.com') {
      return res.status(403).json({ error: 'Admin privileges can only be granted to nhillen@gmail.com' });
    }
    
    const user = await UserService.setAdminStatus(email, true);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, message: user.email + ' is now an admin' });
  } catch (error) {
    console.error('Error setting admin status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;