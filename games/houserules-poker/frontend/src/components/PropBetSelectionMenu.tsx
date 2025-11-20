import React from 'react';

export interface PropBetSelectionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPropBet: (propBetType: string) => void;
}

export const PropBetSelectionMenu: React.FC<PropBetSelectionMenuProps> = ({
  isOpen,
  onClose,
  onSelectPropBet,
}) => {
  if (!isOpen) return null;

  const propBets = [
    {
      id: 'flipz',
      name: 'Flipz',
      icon: '🎴',
      description: 'Bet on red/black cards in the flop',
      color: 'from-yellow-600 to-yellow-500',
    },
    // Future prop bets can be added here
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg p-4 max-w-sm w-full mx-4 border-2 border-yellow-600"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-yellow-500 mb-3 flex items-center gap-2">
          Prop Bet
        </h2>

        <p className="text-gray-400 text-xs mb-4">
          Select a prop bet to propose:
        </p>

        <div className="space-y-2">
          {propBets.map((propBet) => (
            <button
              key={propBet.id}
              onClick={() => {
                onSelectPropBet(propBet.id);
                onClose();
              }}
              className={`w-full bg-gradient-to-r ${propBet.color} hover:brightness-110 text-white rounded-lg p-3 text-left transition-all shadow-lg hover:shadow-xl hover:scale-102 flex items-center gap-3`}
            >
              <span className="text-3xl">{propBet.icon}</span>
              <div className="flex-1">
                <div className="font-bold text-lg">{propBet.name}</div>
                <div className="text-xs text-white/80">{propBet.description}</div>
              </div>
              <span className="text-white/60">→</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
