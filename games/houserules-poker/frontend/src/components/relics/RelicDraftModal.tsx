import React, { useState, useEffect } from 'react';
import type { DraftOptions } from './types';
import { RelicCard } from './RelicCard';

export interface RelicDraftModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Draft options from server */
  draftOptions: DraftOptions | null;
  /** Called when player selects a relic */
  onSelect: (relicId: string) => void;
  /** Whether selection has been made */
  hasSelected?: boolean;
}

export const RelicDraftModal: React.FC<RelicDraftModalProps> = ({
  isOpen,
  draftOptions,
  onSelect,
  hasSelected = false,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Reset selection when draft options change
  useEffect(() => {
    setSelectedId(null);
  }, [draftOptions?.breakNumber]);

  // Countdown timer
  useEffect(() => {
    if (!draftOptions) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, draftOptions.deadline - Date.now());
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [draftOptions?.deadline]);

  if (!isOpen || !draftOptions) return null;

  const timeSeconds = Math.ceil(timeRemaining / 1000);
  const isUrgent = timeSeconds <= 10;

  const handleSelect = (relicId: string) => {
    if (hasSelected) return;
    setSelectedId(relicId);
  };

  const handleConfirm = () => {
    if (selectedId && !hasSelected) {
      onSelect(selectedId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl p-6 max-w-3xl w-full mx-4 border-2 border-purple-600 shadow-2xl shadow-purple-500/20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-purple-400 flex items-center gap-2">
              🎴 Rogue Break #{draftOptions.breakNumber}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              Choose a relic to add to your arsenal
            </p>
          </div>

          {/* Timer */}
          <div className={`
            text-3xl font-mono font-bold
            ${isUrgent ? 'text-red-500 animate-pulse' : 'text-yellow-400'}
          `}>
            {timeSeconds}s
          </div>
        </div>

        {/* Relic Options */}
        <div className="flex justify-center gap-6 mb-6">
          {draftOptions.options.map((relic) => (
            <div key={relic.id} className="relative">
              <RelicCard
                relic={relic}
                selected={selectedId === relic.id}
                onClick={() => handleSelect(relic.id)}
                disabled={hasSelected}
                size="large"
              />
            </div>
          ))}
        </div>

        {/* Selection state */}
        {hasSelected ? (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-green-900/50 border border-green-600 rounded-lg px-4 py-2">
              <span className="text-green-400 text-lg">✓</span>
              <span className="text-green-300">Selection confirmed! Waiting for other players...</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleConfirm}
              disabled={!selectedId}
              className={`
                px-8 py-3 rounded-lg font-bold text-lg
                transition-all duration-200
                ${selectedId
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg hover:scale-105'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {selectedId ? 'Confirm Selection' : 'Select a Relic'}
            </button>
          </div>
        )}

        {/* Auto-select warning */}
        {!hasSelected && isUrgent && !selectedId && (
          <div className="mt-4 text-center">
            <span className="text-red-400 text-sm animate-pulse">
              ⚠️ First relic will be auto-selected if time runs out!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
