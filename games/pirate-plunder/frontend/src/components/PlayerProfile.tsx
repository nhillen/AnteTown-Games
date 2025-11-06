import React, { useState } from 'react';
import { useAuth, type PlayerCosmetics } from './AuthProvider';
import Button from './ui/Button';
import Panel from './ui/Panel';
import { Die } from './Dice';
import { cosmeticOptions } from '../config/cosmetics';
import type { GameType } from './GameSelector';

interface PlayerProfileProps {
  isOpen: boolean;
  onClose: () => void;
  mySeat?: any;
  onStandUp?: () => void;
  onTopUp?: (amount: number) => void;
  tableRequirements?: {
    minimumTableStack: number;
    requiredTableStack: number;
    tableMinimumMultiplier: number;
  } | null;
  gameType?: GameType;
  versionInfo?: {
    frontendVersion?: string;
    backendVersion?: string;
  };
  buildTimestamp?: string;
  debugInfo?: {
    phase?: string;
    isGameActive?: boolean;
    meId?: string | null;
    hasFolded?: boolean;
  };
}

export const PlayerProfile: React.FC<PlayerProfileProps> = ({ isOpen, onClose, mySeat, onStandUp, onTopUp, tableRequirements, gameType = 'pirate-plunder', versionInfo, buildTimestamp, debugInfo }) => {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(user?.name || '');
  const [editedCosmetics, setEditedCosmetics] = useState<PlayerCosmetics>(user?.cosmetics || {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>('');
  const [isTopUpLoading, setIsTopUpLoading] = useState(false);

  if (!isOpen || !user) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      await updateProfile({
        name: editedName !== user.name ? editedName : undefined,
        cosmetics: editedCosmetics
      });
      setIsEditing(false);
    } catch (err) {
      setError('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedName(user.name);
    setEditedCosmetics(user.cosmetics);
    setIsEditing(false);
    setError(null);
  };

  const handleCosmeticChange = (category: keyof PlayerCosmetics, value: string) => {
    setEditedCosmetics(prev => ({
      ...prev,
      [category]: value
    }));
  };

  const handleTopUp = async () => {
    if (!onTopUp || !topUpAmount) return;

    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > user.bankroll) {
      setError('Insufficient bankroll for top-up');
      return;
    }

    setIsTopUpLoading(true);
    setError(null);

    try {
      await onTopUp(amount);
      setTopUpAmount('');
    } catch (err) {
      setError('Top-up failed. Please try again.');
    } finally {
      setIsTopUpLoading(false);
    }
  };

  // Helper function to determine if table stack is dangerously low
  const getTableStackStatus = () => {
    if (!mySeat?.tableStack || !tableRequirements) return 'normal';

    const tableStack = mySeat.tableStack;
    const minimumRequired = tableRequirements.minimumTableStack;
    const warningThreshold = minimumRequired * 1.5; // Show warning at 1.5x minimum

    if (tableStack <= minimumRequired) {
      return 'critical'; // Will be auto-stood next hand
    } else if (tableStack <= warningThreshold) {
      return 'warning'; // Close to minimum
    }
    return 'normal';
  };

  const getAvailableOptions = (category: keyof PlayerCosmetics) => {
    const options = cosmeticOptions[category as keyof typeof cosmeticOptions];
    if (!options) return [];
    
    // Convert object to array with id and name
    const optionsArray = Object.entries(options).map(([id, option]: [string, any]) => ({
      id,
      name: option.name || id
    }));
    
    return optionsArray.filter((option: any) => 
      user.unlockedCosmetics.includes(option.id)
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <Panel className="max-w-2xl w-full m-4 max-h-[80vh] overflow-y-auto bg-slate-800 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Player Profile</h2>
          <Button onClick={onClose} variant="secondary" size="sm">×</Button>
        </div>

        <div className="space-y-6">
          {/* User Info */}
          <div className="flex items-center gap-4">
            {user.avatar && (
              <img 
                src={user.avatar} 
                alt={user.name}
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <h3 className="text-xl font-semibold">{user.name}</h3>
              <p className="text-gray-400">{user.email}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">${user.bankroll.toFixed(2)}</div>
              <div className="text-sm text-gray-400">Bankroll</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{user.totalGamesPlayed}</div>
              <div className="text-sm text-gray-400">Games Played{gameType === 'pirate-plunder' ? '' : ' (All Games)'}</div>
            </div>
            {gameType === 'pirate-plunder' && (
              <>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">${user.totalWinnings.toFixed(2)}</div>
                  <div className="text-sm text-gray-400">Total Winnings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{user.unlockedCosmetics.length}</div>
                  <div className="text-sm text-gray-400">Unlocked Items</div>
                </div>
              </>
            )}
          </div>

          {/* Game Actions */}
          {mySeat && onStandUp && (
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Game Actions</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">Currently seated at table</div>
                    <div className={`text-sm ${
                      getTableStackStatus() === 'critical'
                        ? 'text-red-400 animate-pulse font-semibold'
                        : getTableStackStatus() === 'warning'
                        ? 'text-yellow-400 animate-pulse'
                        : 'text-gray-400'
                    }`}>
                      Table Stack: ${mySeat.tableStack?.toFixed(2) || '0.00'}
                      {getTableStackStatus() === 'critical' && ' ⚠️ CRITICAL LOW'}
                      {getTableStackStatus() === 'warning' && ' ⚠️ LOW'}
                    </div>
                    {(getTableStackStatus() === 'critical' || getTableStackStatus() === 'warning') && (
                      <div className={`mt-2 p-2 rounded text-xs ${
                        getTableStackStatus() === 'critical'
                          ? 'bg-red-900/30 border border-red-600/50 text-red-300'
                          : 'bg-yellow-900/30 border border-yellow-600/50 text-yellow-300'
                      }`}>
                        {getTableStackStatus() === 'critical' && (
                          <>
                            🚨 <strong>CRITICAL:</strong> You will be auto-stood next hand!<br/>
                            Minimum required: ${tableRequirements?.minimumTableStack.toFixed(2)}
                          </>
                        )}
                        {getTableStackStatus() === 'warning' && (
                          <>
                            ⚠️ <strong>WARNING:</strong> Table stack is running low.<br/>
                            Consider topping up soon. Minimum: ${tableRequirements?.minimumTableStack.toFixed(2)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      onStandUp();
                      onClose();
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Stand Up
                  </Button>
                </div>

                {/* Top-up Section */}
                {onTopUp && (
                  <div className="border-t border-slate-700 pt-3">
                    <div className="font-medium mb-2">Top Up Table Stack</div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        placeholder="Amount"
                        step="0.01"
                        min="0.01"
                        max={user.bankroll}
                        className="flex-1 p-2 bg-slate-700 border border-slate-600 rounded-md text-gray-200 text-sm"
                      />
                      <Button
                        onClick={handleTopUp}
                        disabled={isTopUpLoading || !topUpAmount || parseFloat(topUpAmount) <= 0}
                        size="sm"
                        variant="primary"
                      >
                        {isTopUpLoading ? 'Topping Up...' : 'Top Up'}
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Transfer funds from your bankroll to your table stack
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Standing up will remove you from the table after the current hand ends.
                </p>
              </div>
            </div>
          )}

          {/* Cosmetics Section - PiratePlunder only */}
          {gameType === 'pirate-plunder' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Cosmetic Customization</h3>
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} size="sm">
                  Edit Appearance
                </Button>
              ) : (
                <div className="space-x-2">
                  <Button onClick={handleCancel} variant="secondary" size="sm">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} size="sm" disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {/* Identity Cosmetics */}
              <div>
                <h4 className="text-md font-semibold mb-3 text-blue-300">⚡ Identity</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['banner', 'emblem', 'title'].map((category) => {
                    const availableOptions = getAvailableOptions(category as keyof PlayerCosmetics);
                    const currentValue = isEditing 
                      ? editedCosmetics[category as keyof PlayerCosmetics]
                      : user.cosmetics[category as keyof PlayerCosmetics];

                    return (
                      <div key={category} className="space-y-2">
                        <label className="block text-sm font-medium capitalize">
                          {category.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        {isEditing ? (
                          <select
                            value={currentValue || ''}
                            onChange={(e) => handleCosmeticChange(category as keyof PlayerCosmetics, e.target.value)}
                            className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-gray-200"
                          >
                            {availableOptions.map((option: any) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="p-2 bg-slate-700 rounded-md text-gray-200">
                            {Object.entries(cosmeticOptions[category as keyof typeof cosmeticOptions]).find(([id]) => id === currentValue)?.[1]?.name || 'Default'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dice Collections */}
              <div>
                <h4 className="text-md font-semibold mb-3 text-yellow-300">🎲 Dice Collections</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['highSkin', 'lowSkin'].map((category) => {
                    const availableOptions = getAvailableOptions(category as keyof PlayerCosmetics);
                    const currentValue = isEditing 
                      ? editedCosmetics[category as keyof PlayerCosmetics]
                      : user.cosmetics[category as keyof PlayerCosmetics];

                    return (
                      <div key={category} className="space-y-2">
                        <label className="block text-sm font-medium">
                          {category === 'highSkin' ? '🔥 High Rolls (4-6)' : '❄️ Low Rolls (1-3)'}
                        </label>
                        {isEditing ? (
                          <select
                            value={currentValue || ''}
                            onChange={(e) => handleCosmeticChange(category as keyof PlayerCosmetics, e.target.value)}
                            className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-gray-200"
                          >
                            {availableOptions.map((option: any) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="p-3 bg-slate-700 rounded-md text-gray-200 h-[140px] flex items-center">
                            <div className="flex items-center gap-3 w-full">
                              <div className="flex gap-1 flex-shrink-0 items-center justify-center">
                                <Die
                                  value={category === 'highSkin' ? 6 : 2}
                                  locked={false}
                                  highSkin={category === 'highSkin' ? currentValue : user?.cosmetics?.highSkin}
                                  lowSkin={category === 'lowSkin' ? currentValue : user?.cosmetics?.lowSkin}
                                  size="sm"
                                  preview={true}
                                />
                                <Die
                                  value={category === 'highSkin' ? 5 : 1}
                                  locked={false}
                                  highSkin={category === 'highSkin' ? currentValue : user?.cosmetics?.highSkin}
                                  lowSkin={category === 'lowSkin' ? currentValue : user?.cosmetics?.lowSkin}
                                  size="sm"
                                  preview={true}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">
                                  {Object.entries(cosmeticOptions[category as keyof typeof cosmeticOptions]).find(([id]) => id === currentValue)?.[1]?.name || 'Default'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                  {Object.entries(cosmeticOptions[category as keyof typeof cosmeticOptions]).find(([id]) => id === currentValue)?.[1]?.rarity || 'Starter'} •
                                  {Object.entries(cosmeticOptions[category as keyof typeof cosmeticOptions]).find(([id]) => id === currentValue)?.[1]?.description || 'Default dice'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  💡 High Skin shows on 4-6 rolls, Low Skin shows on 1-3 rolls
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Name Editing */}
          {isEditing && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">Display Name</label>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md text-gray-200"
                placeholder="Enter your display name"
              />
            </div>
          )}

          {/* Version Info */}
          {(versionInfo || debugInfo) && (
            <div className="border-t border-slate-700 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-slate-400 mb-2">System Information</h4>
              <div className="space-y-1 text-xs font-mono text-slate-500">
                {versionInfo && (
                  <>
                    <div>Frontend: v{versionInfo.frontendVersion}</div>
                    <div>Backend: v{versionInfo.backendVersion || 'connecting...'}</div>
                    {buildTimestamp && (
                      <div className="text-[10px]">Built: {new Date(buildTimestamp).toLocaleString()}</div>
                    )}
                  </>
                )}
                {debugInfo && user?.isAdmin && (
                  <>
                    {versionInfo && <div className="border-t border-slate-600 my-2" />}
                    <div className="text-slate-400 font-semibold">Debug Info (Admin Only):</div>
                    <div>Phase: {debugInfo.phase || 'N/A'}</div>
                    <div>Game Active: {String(debugInfo.isGameActive ?? false)}</div>
                    <div>Player ID: {debugInfo.meId || 'N/A'}</div>
                    <div>Seated: {mySeat ? 'Yes' : 'No'}</div>
                    <div>Folded: {debugInfo.hasFolded ? 'Yes' : 'No'}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
};