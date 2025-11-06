import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getBackendUrl } from '../utils/backendUrl';

export interface PlayerCosmetics {
  banner?: string;
  emblem?: string;
  title?: string;
  highSkin?: string;
  lowSkin?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bankroll: number;
  cosmetics: PlayerCosmetics;
  unlockedCosmetics: string[];
  totalGamesPlayed: number;
  totalWinnings: number;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  updateProfile: (updates: { name?: string; cosmetics?: Partial<PlayerCosmetics> }) => Promise<void>;
  refreshUser: () => void;
  updateBankroll: (newBankrollDollars: number) => void;
  purchaseCosmetic: (itemId: string, price: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const backendUrl = getBackendUrl();

  const fetchUser = async () => {
    try {
      const response = await fetch(`${backendUrl}/auth/user`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401) {
        // 401 is expected when not logged in - not an error
        setUser(null);
      } else {
        // Only log actual errors (500, network issues, etc.)
        console.error('Unexpected auth response:', response.status);
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    window.location.href = `${backendUrl}/auth/google`;
  };

  const logout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updateProfile = async (updates: { name?: string; cosmetics?: Partial<PlayerCosmetics> }) => {
    try {
      const response = await fetch(`${backendUrl}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUser(prev => prev ? { ...prev, ...updatedUser } : null);
      } else {
        throw new Error('Profile update failed');
      }
    } catch (error) {
      console.error('Profile update failed:', error);
      throw error;
    }
  };

  const refreshUser = () => {
    fetchUser();
  };

  const updateBankroll = (newBankrollDollars: number) => {
    console.log(`💰 Updating auth context bankroll to $${newBankrollDollars}`);
    setUser(prev => {
      if (!prev) return null;
      const newUser = { ...prev, bankroll: newBankrollDollars };
      console.log(`💰 Auth context user updated:`, { oldBankroll: prev.bankroll, newBankroll: newUser.bankroll });
      return newUser;
    });
  };

  const purchaseCosmetic = async (itemId: string, price: number) => {
    try {
      const response = await fetch(`${backendUrl}/auth/purchase-cosmetic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ itemId, price })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Purchase failed');
      }

      const updatedUser = await response.json();
      setUser(prev => prev ? { ...prev, ...updatedUser } : null);
    } catch (error) {
      console.error('Cosmetic purchase failed:', error);
      throw error;
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    // Check for auth success redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      window.history.replaceState({}, document.title, window.location.pathname);
      refreshUser();
    }
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    updateProfile,
    refreshUser,
    updateBankroll,
    purchaseCosmetic
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};