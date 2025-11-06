import { User as PrismaUser } from '@prisma/client';
import prisma from '../config/database';

export interface PlayerCosmetics {
  banner?: string;
  emblem?: string;
  title?: string;
  highSkin?: string;
  lowSkin?: string;
}

export interface UserProfile extends Omit<PrismaUser, 'unlockedCosmetics'> {
  cosmetics: PlayerCosmetics;
  unlockedCosmetics: string[];
}

export class UserService {
  static async findByGoogleId(googleId: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { googleId }
    });
    
    if (!user) return null;
    
    return this.transformUser(user);
  }

  static async findById(id: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!user) return null;
    
    return this.transformUser(user);
  }

  static async create(data: {
    googleId: string;
    email: string;
    name: string;
    avatar?: string;
  }): Promise<UserProfile> {
    const user = await prisma.user.create({
      data: {
        ...data,
        unlockedCosmetics: 'default,wooden,dots,gold,blue,Landlubber'
      }
    });
    
    return this.transformUser(user);
  }

  static async updateProfile(id: string, updates: {
    name?: string;
    cosmetics?: Partial<PlayerCosmetics>;
  }): Promise<UserProfile> {
    const updateData: any = {};
    
    if (updates.name) {
      updateData.name = updates.name;
    }
    
    if (updates.cosmetics) {
      Object.assign(updateData, updates.cosmetics);
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });
    
    return this.transformUser(user);
  }

  static async updateLastLogin(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() }
    });
  }

  static async updateGameStats(id: string, winnings: number): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: {
        totalGamesPlayed: { increment: 1 },
        totalWinnings: { increment: winnings },
        bankroll: { increment: winnings }
      }
    });
  }

  static async setAdminStatus(email: string, isAdmin: boolean): Promise<UserProfile | null> {
    const user = await prisma.user.update({
      where: { email },
      data: { isAdmin }
    });
    
    return user ? this.transformUser(user) : null;
  }

  static async purchaseCosmetic(id: string, itemId: string, price: number): Promise<UserProfile> {
    // Get current user
    const user = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user has enough bankroll
    if (user.bankroll < price) {
      throw new Error('Insufficient funds');
    }
    
    // Check if user already owns the cosmetic
    const unlockedCosmetics = user.unlockedCosmetics.split(',').filter(Boolean);
    if (unlockedCosmetics.includes(itemId)) {
      throw new Error('Cosmetic already owned');
    }
    
    // Add cosmetic to unlocked list and deduct price from bankroll
    const updatedUnlockedCosmetics = [...unlockedCosmetics, itemId].join(',');
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        unlockedCosmetics: updatedUnlockedCosmetics,
        bankroll: user.bankroll - price
      }
    });
    
    return this.transformUser(updatedUser);
  }

  private static transformUser(user: PrismaUser): UserProfile {
    return {
      ...user,
      cosmetics: {
        banner: user.banner,
        emblem: user.emblem,
        title: user.title,
        highSkin: user.highSkin,
        lowSkin: user.lowSkin
      },
      unlockedCosmetics: user.unlockedCosmetics.split(',').filter(Boolean)
    };
  }
}

export type { UserProfile as User };