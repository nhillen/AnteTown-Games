import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GameInfoDrawerProps {
  isSeated: boolean;
  isStanding?: boolean;
  onPropBet?: () => void;
  onStandAfterHand?: () => void;
  onStandImmediate?: () => void;
  onSitDown?: () => void;
  onLeaveTable?: () => void;
  hasPendingPropBets?: boolean;
}

export function GameInfoDrawer({
  isSeated,
  isStanding = false,
  onPropBet,
  onStandAfterHand,
  onStandImmediate,
  onSitDown,
  onLeaveTable,
  hasPendingPropBets = false
}: GameInfoDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showStandUpOptions, setShowStandUpOptions] = useState(false);

  return (
    <>
      {/* Toggle Arrow Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        animate={{ right: isOpen ? '280px' : '0px' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-1/2 -translate-y-1/2 z-50 bg-slate-800/90 hover:bg-slate-700/90 backdrop-blur border border-slate-600 hover:border-slate-400 rounded-l-lg px-2 py-4 shadow-lg transition-colors"
        style={{
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        }}
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="relative"
        >
          {hasPendingPropBets && !isOpen && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full"
            />
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-white"
          >
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      </motion.button>

      {/* Drawer Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-72 bg-slate-900/95 backdrop-blur border-l border-slate-700 shadow-2xl z-40 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-white font-bold text-lg">Game Info</h2>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Prop Bet Section */}
              {onPropBet && isSeated && (
                <div>
                  <h3 className="text-slate-400 text-xs font-semibold uppercase mb-2">
                    Side Games
                  </h3>
                  <button
                    onClick={onPropBet}
                    className="w-full px-4 py-3 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white rounded-lg text-sm font-bold backdrop-blur border border-yellow-600 hover:border-yellow-400 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>🎴</span>
                    Propose Prop Bet
                  </button>
                  {hasPendingPropBets && (
                    <div className="mt-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-300 text-xs">
                      🔔 New prop bet proposal!
                    </div>
                  )}
                </div>
              )}

              {/* Table Management Section */}
              <div>
                <h3 className="text-slate-400 text-xs font-semibold uppercase mb-2">
                  Table Actions
                </h3>

                {isSeated && !isStanding && (
                  <>
                    {!showStandUpOptions ? (
                      <button
                        onClick={() => setShowStandUpOptions(true)}
                        className="w-full px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-white rounded-lg text-sm backdrop-blur border border-slate-600 hover:border-slate-400 transition-all"
                      >
                        Stand Up
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-slate-300 text-xs mb-2">
                          Choose when to stand:
                        </div>
                        <button
                          onClick={() => {
                            onStandAfterHand?.();
                            setShowStandUpOptions(false);
                            setIsOpen(false);
                          }}
                          className="w-full px-3 py-2 bg-blue-600/80 hover:bg-blue-500/80 text-white rounded text-sm transition-all"
                        >
                          After Current Hand
                        </button>
                        <button
                          onClick={() => {
                            onStandImmediate?.();
                            setShowStandUpOptions(false);
                            setIsOpen(false);
                          }}
                          className="w-full px-3 py-2 bg-orange-600/80 hover:bg-orange-500/80 text-white rounded text-sm transition-all"
                        >
                          Immediately (Fold)
                        </button>
                        <button
                          onClick={() => setShowStandUpOptions(false)}
                          className="w-full px-3 py-2 bg-slate-700/80 hover:bg-slate-600/80 text-white rounded text-sm transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}

                {isStanding && (
                  <div className="space-y-2">
                    <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded text-blue-300 text-xs mb-2">
                      👀 Watching table
                    </div>
                    {onSitDown && (
                      <button
                        onClick={onSitDown}
                        className="w-full px-4 py-2 bg-green-600/80 hover:bg-green-500/80 text-white rounded-lg text-sm backdrop-blur border border-green-500 hover:border-green-400 transition-all"
                      >
                        Sit Down
                      </button>
                    )}
                    {onLeaveTable && (
                      <button
                        onClick={onLeaveTable}
                        className="w-full px-4 py-2 bg-red-600/80 hover:bg-red-500/80 text-white rounded-lg text-sm backdrop-blur border border-red-500 hover:border-red-400 transition-all"
                      >
                        Leave Table
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Info Section */}
              <div className="pt-4 border-t border-slate-700">
                <h3 className="text-slate-400 text-xs font-semibold uppercase mb-2">
                  Controls
                </h3>
                <div className="text-slate-400 text-xs space-y-1">
                  <div><kbd className="px-1 bg-slate-800 rounded">F</kbd> - Fold</div>
                  <div><kbd className="px-1 bg-slate-800 rounded">C</kbd> - Call/Check</div>
                  <div><kbd className="px-1 bg-slate-800 rounded">R</kbd> - Raise</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
