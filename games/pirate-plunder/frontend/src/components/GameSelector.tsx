/**
 * GameSelector - Choose which game to play after login
 *
 * Displays available games (Flipz, Pirate Plunder, etc.)
 * and allows user to select one to join
 */

import { useState } from 'react'
import Panel from './ui/Panel'
import Button from './ui/Button'

export type GameType = 'flipz' | 'pirate-plunder' | 'warfaire' | 'houserules-poker'

export type GameInfo = {
  gameId: string
  gameType: GameType
  displayName: string
  description: string
  minPlayers: number
  maxPlayers: number
  emoji: string
}

type GameSelectorProps = {
  userName: string
  bankroll: number
  onSelectGame: (gameType: GameType) => void
}

export default function GameSelector({ userName, bankroll, onSelectGame }: GameSelectorProps) {
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)

  const games: GameInfo[] = [
    {
      gameId: 'flipz-1',
      gameType: 'flipz',
      displayName: 'CK Flipz',
      description: 'Lightning-fast action! Pick your table, make your bet, instant results. No waiting!',
      minPlayers: 2,
      maxPlayers: 6,
      emoji: '🪙',
    },
    {
      gameId: 'pirate-plunder-1',
      gameType: 'pirate-plunder',
      displayName: 'Pirate Plunder',
      description: 'Roll dice to become Ship, Captain, or Crew. Bet on your roles and plunder the pot!',
      minPlayers: 2,
      maxPlayers: 6,
      emoji: '🏴‍☠️',
    },
    {
      gameId: 'warfaire-1',
      gameType: 'warfaire',
      displayName: 'War Faire',
      description: 'State fair card game with prestige, ribbons, and competitive scoring across three fairs!',
      minPlayers: 4,
      maxPlayers: 10,
      emoji: '🎪',
    },
    {
      gameId: 'houserules-poker-1',
      gameType: 'houserules-poker',
      displayName: 'House Rules Poker',
      description: 'Classic Texas Hold\'em Poker with strategic betting and hand rankings!',
      minPlayers: 2,
      maxPlayers: 9,
      emoji: '♠️',
    },
  ]

  const handleSelectGame = (gameType: GameType) => {
    setSelectedGame(gameType)
  }

  const handleConfirmSelection = () => {
    if (selectedGame) {
      onSelectGame(selectedGame)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <Panel title="🎮 Select Your Game" className="mb-6">
          <div className="text-center mb-6">
            <p className="text-xl mb-2">Welcome, {userName}! 👋</p>
            <p className="text-gray-300">
              Bankroll: <span className="text-green-400 font-bold">${(bankroll / 100).toFixed(2)}</span>
            </p>
            <p className="text-sm text-gray-400 mt-2">Choose a game to get started</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {games.map((game) => (
              <button
                key={game.gameType}
                onClick={() => handleSelectGame(game.gameType)}
                className={`
                  p-6 rounded-lg border-2 transition-all text-left
                  ${
                    selectedGame === game.gameType
                      ? 'border-emerald-500 bg-emerald-900/30 shadow-lg shadow-emerald-500/20'
                      : 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-700/50'
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <div className="text-5xl">{game.emoji}</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2 text-white">{game.displayName}</h3>
                    <p className="text-sm text-gray-300 mb-3">{game.description}</p>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>👥 {game.minPlayers}-{game.maxPlayers} players</span>
                    </div>
                  </div>
                </div>
                {selectedGame === game.gameType && (
                  <div className="mt-3 text-emerald-400 text-sm font-medium flex items-center gap-2">
                    <span>✓</span> Selected
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-center">
            <Button
              onClick={handleConfirmSelection}
              disabled={!selectedGame}
              variant="primary"
              size="md"
              className="min-w-[200px]"
            >
              {selectedGame ? `Play ${games.find(g => g.gameType === selectedGame)?.displayName}` : 'Select a Game'}
            </Button>
          </div>
        </Panel>

        {/* Game Details */}
        {selectedGame && (
          <Panel title="📋 How to Play" className="bg-slate-800/70">
            <div className="space-y-3 text-sm">
              {selectedGame === 'flipz' && (
                <>
                  <p className="text-gray-300">
                    <strong className="text-white">CK Flipz</strong> is the simplest game of chance:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-300 ml-2">
                    <li>Two or more players sit at the table</li>
                    <li>Everyone antes $5 (or configured amount)</li>
                    <li>First player calls "heads" or "tails"</li>
                    <li>Coin flips automatically</li>
                    <li>If the call matches the result, the caller wins the pot</li>
                    <li>If the call doesn't match, the other player(s) win</li>
                  </ol>
                  <p className="text-yellow-400 mt-4">
                    💡 Fast-paced and perfect for testing your luck!
                  </p>
                </>
              )}
              {selectedGame === 'pirate-plunder' && (
                <>
                  <p className="text-gray-300">
                    <strong className="text-white">Pirate Plunder</strong> is a dice poker game with ship roles:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-300 ml-2">
                    <li>Roll 5 dice to get Ship (6s), Captain (5s), and Crew (4s)</li>
                    <li>Lock dice you want to keep between rolls</li>
                    <li>Bet after each roll based on your hand strength</li>
                    <li>Leftover dice (1s, 2s, 3s) become cargo - majority wins</li>
                    <li>Win roles and cargo to claim the pot!</li>
                  </ol>
                  <p className="text-yellow-400 mt-4">
                    💡 Strategic gameplay with bluffing and hand evaluation!
                  </p>
                </>
              )}
              {selectedGame === 'warfaire' && (
                <>
                  <p className="text-gray-300">
                    <strong className="text-white">War Faire</strong> is a strategic state fair card game:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-300 ml-2">
                    <li>Play cards face-up and face-down each round</li>
                    <li>Compete in different fair categories for ribbons</li>
                    <li>Earn prestige points based on your performance</li>
                    <li>Play through 3 rounds per fair, and 3 fairs total</li>
                    <li>Highest victory points at the end wins!</li>
                  </ol>
                  <p className="text-yellow-400 mt-4">
                    💡 Long-form strategic game with hidden information!
                  </p>
                </>
              )}
              {selectedGame === 'houserules-poker' && (
                <>
                  <p className="text-gray-300">
                    <strong className="text-white">House Rules Poker</strong> is classic Texas Hold'em:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-300 ml-2">
                    <li>Each player receives 2 hole cards (private)</li>
                    <li>Bet in rounds: Pre-flop, Flop (3 cards), Turn (1 card), River (1 card)</li>
                    <li>Use your 2 hole cards + 5 community cards to make the best 5-card hand</li>
                    <li>Actions: Fold, Check, Call, Bet, Raise, All-in</li>
                    <li>Best hand wins the pot at showdown!</li>
                  </ol>
                  <p className="text-yellow-400 mt-4">
                    💡 Skill, strategy, and reading your opponents!
                  </p>
                </>
              )}
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
