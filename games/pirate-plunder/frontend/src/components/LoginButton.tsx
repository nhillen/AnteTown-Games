import React from 'react';
import { useAuth } from './AuthProvider';
import Button from './ui/Button';

interface LoginButtonProps {
  gameBankroll?: number; // Bankroll from game state (in pennies), overrides user.bankroll
  className?: string; // Optional className for custom styling
}

export const LoginButton: React.FC<LoginButtonProps> = ({ gameBankroll, className }) => {
  const { user, loading, login, logout } = useAuth();

  // Use game bankroll if available (convert pennies to dollars), otherwise use user bankroll
  const displayBankroll = gameBankroll !== undefined ? gameBankroll / 100 : user?.bankroll || 0;

  // Debug: Log when component re-renders
  React.useEffect(() => {
    console.log(`🔄 LoginButton re-rendered with bankroll: $${displayBankroll} (game: ${gameBankroll}, user: ${user?.bankroll})`);
  }, [displayBankroll, gameBankroll, user?.bankroll]);

  if (loading) {
    return (
      <Button disabled>
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {user.avatar && (
            <img 
              src={user.avatar} 
              alt={user.name}
              className="w-8 h-8 rounded-full"
            />
          )}
          <span className="text-sm font-medium text-gray-700">
            {user.name}
          </span>
          <span className="text-xs text-gray-500">
            ${displayBankroll.toFixed(2)}
          </span>
        </div>
        <Button 
          onClick={logout}
          variant="secondary"
          size="sm"
        >
          Logout
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={login} className={className}>
      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Login with Google
    </Button>
  );
};