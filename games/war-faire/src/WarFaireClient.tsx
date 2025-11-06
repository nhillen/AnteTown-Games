import React, { useState, useEffect, useRef } from 'react';
import { CardShell } from './components/presentational/CardShell.js';
import { CardBack } from './components/presentational/CardBack.js';
import { MiniCardChip } from './components/presentational/MiniCardChip.js';
import { LeaderChip } from './components/presentational/LeaderChip.js';
import { getCardArt } from './components/presentational/cardArt.js';

// Category emojis (kept for summary/results screens, removed from main UI)
const CATEGORY_EMOJIS: Record<string, string> = {
  'Carrots': '🥕',
  'Pumpkins': '🎃',
  'Tomatoes': '🍅',
  'Corn': '🌽',
  'Pies': '🥧',
  'Cakes': '🎂',
  'Cookies': '🍪',
  'Breads': '🍞',
  'Pigs': '🐷',
  'Cows': '🐄',
  'Chickens': '🐔',
  'Produce': '🌾',
  'Baking': '🧁',
  'Livestock': '🐮'
};

type Card = {
  category: string;
  value: number;
  isGroupCard: boolean;
  selectedCategory?: string; // For group cards, the specific category they were played as
  playedAtFair?: number;
  playedAtRound?: number;
  getEffectiveCategory?: () => string; // Method from backend Card class (not serialized via Socket.IO)
};

type Seat = {
  playerId: string;
  name: string;
  isAI: boolean;
  hand?: Card[];
  playedCards?: Card[];
  ribbons?: any[];
  totalVP?: number;
  hasActed?: boolean;
};

type Category = {
  name: string;
  group: string;
};

type WarFaireGameState = {
  phase: string;
  seats: Seat[];
  activeCategories?: Category[];
  categoryPrestige?: Record<string, number>;
  currentFair?: number;
  currentRound?: number;
};

// Round Summary Overlay Component
function RoundSummaryOverlay({ roundNumber, onContinue }: { roundNumber: number; onContinue: () => void }) {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl px-12 py-8 animate-pulse">
        <h2 className="text-4xl font-bold text-center text-purple-700">
          Round {roundNumber} Complete!
        </h2>
      </div>
    </div>
  );
}

type WarFaireClientProps = {
  game: WarFaireGameState | null;
  meId: string;
  onPlayerAction: (action: string, data?: any) => void;
  onSitDown: (seatIndex: number, buyInAmount: number) => void;
  onStandUp: () => void;
  isSeated: boolean;
  isAdmin?: boolean;
};

export default function WarFaireClient({
  game,
  meId,
  onPlayerAction,
  onSitDown,
  onStandUp,
  isSeated,
  isAdmin = false
}: WarFaireClientProps) {
  // ===== EXISTING STATE - DO NOT MODIFY =====
  const [slotA, setSlotA] = useState<{ card: Card; index: number } | null>(null);
  const [slotB, setSlotB] = useState<{ card: Card; index: number } | null>(null);
  const [isFaceUp, setIsFaceUp] = useState(true);
  const [showStandings, setShowStandings] = useState(false);
  const [activeTab, setActiveTab] = useState<'hand' | 'played'>('hand');
  const [boardTab, setBoardTab] = useState<'all' | 'you' | 'rivals'>('all');

  // ===== UI STATE FOR POPOVER =====
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number }>({ x: 0, y: 0 });

  // ===== GROUP CARD CATEGORY SELECTION =====
  const [groupSelections, setGroupSelections] = useState<{ slotA?: string; slotB?: string }>({});

  // ===== COUNTDOWN TIMER FOR GROUP SELECTION =====
  const [groupSelectionTimeRemaining, setGroupSelectionTimeRemaining] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Extract values we need before useEffect to avoid object reference issues
  const currentPhase = game?.phase;
  const timeoutStart = (game as any)?.groupSelectionTimeoutStart;
  const timeoutDuration = (game as any)?.groupSelectionTimeoutDuration;

  // Update countdown timer when in GroupSelection phase
  useEffect(() => {
    // Cancel any existing timer
    if (timerRef.current !== null) {
      cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }

    if (currentPhase?.includes('GroupSelection')) {
      if (timeoutStart && timeoutDuration) {
        const updateTimer = () => {
          const elapsed = Date.now() - timeoutStart;
          const remaining = Math.max(0, timeoutDuration - elapsed);
          setGroupSelectionTimeRemaining(remaining);

          if (remaining > 0) {
            timerRef.current = requestAnimationFrame(updateTimer);
          } else {
            timerRef.current = null;
          }
        };

        updateTimer();
      }
    } else {
      setGroupSelectionTimeRemaining(null);
    }

    // Cleanup function
    return () => {
      if (timerRef.current !== null) {
        cancelAnimationFrame(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentPhase, timeoutStart, timeoutDuration]);

  // ===== DERIVED DATA FROM EXISTING PROPS =====
  const mySeat = game?.seats?.find(s => s && s.playerId === meId);
  const myHand = mySeat?.hand || [];
  const myPlayedCards = mySeat?.playedCards || [];
  const myFaceDownCards = (mySeat as any)?.faceDownCards || [];
  const myTotalVP = mySeat?.totalVP || 0;

  const activeCategories = game?.activeCategories || [];
  const categoryPrestige = game?.categoryPrestige || {};
  const currentFair = game?.currentFair || 1;
  const currentRound = game?.currentRound || 1;

  // During GroupSelection phase, include the card being flipped
  const cardsToFlip = (game as any)?.cardsToFlip || [];
  const myCardBeingFlipped = game?.phase.includes('GroupSelection')
    ? cardsToFlip.find((c: any) => c.playerId === meId)
    : null;

  // Combine regular face-down cards with the card being flipped (if any)
  const allMyFaceDownCards = [...myFaceDownCards];

  // Debug logging (commented out to reduce spam)
  // console.log('🎴 [CLIENT DEBUG] Face-down cards state:', {
  //   phase: game?.phase,
  //   isGroupSelection: game?.phase.includes('GroupSelection'),
  //   myFaceDownCards: myFaceDownCards.length,
  //   cardsToFlip: cardsToFlip.length,
  //   cardsToFlipData: cardsToFlip.map((c: any) => ({
  //     playerId: typeof c.playerId === 'string' ? c.playerId.slice(0, 8) : c.playerId,
  //     card: c.card?.category || 'unknown'
  //   })),
  //   myCardBeingFlipped: myCardBeingFlipped ? myCardBeingFlipped.card.category : 'none',
  //   allMyFaceDownCardsBefore: allMyFaceDownCards.length
  // });

  if (myCardBeingFlipped?.card) {
    // Reconstruct the card object with the metadata needed for display
    allMyFaceDownCards.push({
      ...myCardBeingFlipped.card,
      playedFaceDownAtFair: currentFair === 1 ? 0 : currentFair - 1,
      playedFaceDownAtRound: currentRound,
      getEffectiveCategory: function() {
        return this.selectedCategory || this.category;
      }
    });
    // Removed spamming debug log
  }

  // ===== SEAT SELECTION HANDLER =====
  const handleSeatClick = (seatIndex: number, seat: any) => {
    // If seat is occupied, do nothing
    if (seat && seat.playerId) {
      return;
    }

    // If not seated, sit down
    if (!isSeated) {
      console.log(`🪑 Player ${meId} sitting at seat ${seatIndex}`);
      onSitDown(seatIndex, 1000);
    } else if (isAdmin) {
      // If already seated and admin, add AI to this seat
      console.log(`🪑 Admin adding AI to seat ${seatIndex}`);
      onPlayerAction('add_ai', { count: 1, seatIndex });
    }
    // Non-admin seated players can't click empty seats
  };

  // ===== DEBUG LOGGING =====
  useEffect(() => {
    if (mySeat) {
      const faceUpCards = (mySeat as any).faceUpCards || [];
      const faceDownCards = (mySeat as any).faceDownCards || [];

      console.log('🐛 [DEBUG] My Card State:', {
        phase: game?.phase,
        fair: currentFair,
        round: currentRound,
        hand: myHand.map((c: any) => ({
          category: c.getEffectiveCategory ? c.getEffectiveCategory() : c.category,
          value: c.value,
          isGroup: c.isGroupCard
        })),
        playedCards: myPlayedCards.map((c: any) => ({
          category: c.getEffectiveCategory ? c.getEffectiveCategory() : c.category,
          value: c.value,
          fair: c.playedAtFair,
          round: c.playedAtRound
        })),
        faceUpCards: faceUpCards.map((c: any) => ({
          category: c.getEffectiveCategory ? c.getEffectiveCategory() : c.category,
          value: c.value
        })),
        faceDownCards: faceDownCards.map((c: any) => ({
          category: c.getEffectiveCategory ? c.getEffectiveCategory() : c.category,
          value: c.value,
          forFair: c.playedFaceDownAtFair,
          forRound: c.playedFaceDownAtRound
        })),
        totalCards: myHand.length + myPlayedCards.length + faceUpCards.length + faceDownCards.length
      });
    }
  }, [game, mySeat, myHand, myPlayedCards, currentFair, currentRound]);

  // ===== EXISTING RESET LOGIC - DO NOT MODIFY =====
  useEffect(() => {
    setSlotA(null);
    setSlotB(null);
    setIsFaceUp(true);
    setGroupSelections({});
  }, [currentRound, currentFair]);

  // ===== EXISTING HANDLERS - DO NOT MODIFY =====
  const selectCard = (card: Card, index: number) => {
    if (slotA?.index === index) {
      setSlotA(null);
      return;
    }
    if (slotB?.index === index) {
      setSlotB(null);
      return;
    }
    if (!slotA) {
      setSlotA({ card, index });
    } else if (!slotB) {
      setSlotB({ card, index });
    }
  };

  const clearSelection = () => {
    setSlotA(null);
    setSlotB(null);
    setGroupSelections({});
  };

  const submitCards = () => {
    // In Fair 3, only need slotA (face-up card). In Fairs 1 & 2, need both slots
    if (!slotA || (currentFair < 3 && !slotB)) {
      return;
    }

    // Build group selections object
    // In Fair 3, slotA is always face-up (single card play)
    // In Fairs 1-2, determine which is face-up based on isFaceUp toggle
    const faceUpCard = currentFair === 3 ? slotA.card : (isFaceUp ? slotA.card : slotB?.card);
    const faceDownCard = currentFair === 3 ? null : (isFaceUp ? slotB?.card : slotA.card);
    const selections: { faceUp?: string; faceDown?: string } = {};

    // Debug logging
    console.log('Submit cards debug:', {
      currentFair,
      isFaceUp,
      slotA: slotA?.card.category,
      slotB: slotB?.card.category,
      faceUpCard: faceUpCard?.category,
      faceDownCard: faceDownCard?.category,
      groupSelections
    });

    // Only handle selections for face-up cards (they score immediately and need category selection)
    // Face-down cards will have their category selected when they flip in future fairs
    if (faceUpCard?.isGroupCard) {
      const slotKey = currentFair === 3 ? 'slotA' : (isFaceUp ? 'slotA' : 'slotB');
      selections.faceUp = groupSelections[slotKey] || faceUpCard.getEffectiveCategory?.() || faceUpCard.category;
      console.log('Face-up group card selection:', { slotKey, selected: selections.faceUp });
    }

    // Don't set selections for face-down group cards - they'll be selected when flipped
    // (Removing the face-down selection logic to avoid confusion)

    onPlayerAction('play_cards', {
      faceUpCard,
      faceDownCard,
      groupSelections: selections
    });
    clearSelection();
  };

  // Only check for group selections on the face-up card
  // Face-down group cards will have their category selected when they flip in future fairs
  // In Fair 3, slotA is always face-up
  const faceUpSlot = currentFair === 3 ? slotA : (isFaceUp ? slotA : slotB);
  const faceUpHasSelection = !faceUpSlot || !faceUpSlot.card.isGroupCard ||
    (currentFair === 3 ? groupSelections.slotA : (isFaceUp ? groupSelections.slotA : groupSelections.slotB));

  // In Fair 3, only need slotA. In Fairs 1 & 2, need both slots
  const canSubmit = slotA && (currentFair < 3 ? slotB : true) && faceUpHasSelection;

  // ===== LOADING STATE =====
  if (!game) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-xl text-gray-500">Loading...</div>
      </div>
    );
  }

  // ===== LOBBY VIEW - KEEPING EXISTING LOGIC =====
  if (game.phase === 'Lobby') {
    const seatedPlayers = game.seats.filter((s: any) => s && s.playerId);
    const canStart = seatedPlayers.length >= 4; // Require 4 players minimum
    const emptySeats = game.seats.filter((s: any) => !s || !s.playerId).length;

    console.log('🎪 Lobby state:', {
      seatedPlayersCount: seatedPlayers.length,
      seatedPlayers: seatedPlayers.map((s: any) => ({ id: s.playerId, name: s.name, isAI: s.isAI })),
      emptySeats,
      canStart,
      myId: meId
    });

    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-slate-50">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">War Faire</h2>
            <p className="text-sm text-slate-600 mb-2">{seatedPlayers.length} / 10 seated</p>
            {!isSeated && (
              <p className="text-xs text-purple-600 font-medium">Click an empty seat to join</p>
            )}
            {isSeated && !isAdmin && (
              <p className="text-xs text-slate-500">Waiting for more players...</p>
            )}
            {isAdmin && (
              <p className="text-xs text-slate-500">Admin: Click empty seats to add AI players</p>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
            <div className="grid grid-cols-5 gap-2">
              {game.seats.map((seat: any, index: number) => (
                <div
                  key={index}
                  onClick={() => handleSeatClick(index, seat)}
                  className={`
                    border rounded p-2 text-center text-xs transition-all
                    ${seat && seat.playerId
                      ? 'border-green-500 bg-green-50 cursor-default'
                      : 'border-slate-300 bg-slate-50 cursor-pointer hover:border-purple-500 hover:bg-purple-50 hover:shadow-md'
                    }
                    ${seat && seat.playerId === meId ? 'ring-2 ring-blue-500' : ''}
                  `}
                >
                  {seat && seat.playerId ? (
                    <>
                      <div className="text-lg mb-1">{seat.isAI ? '🤖' : '👤'}</div>
                      <div className="font-medium truncate">{seat.name.split(' ')[0]}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg mb-1 text-slate-400">💺</div>
                      <div className="text-slate-400 text-[10px]">
                        {!isSeated ? 'Sit Here' : isAdmin ? 'Add AI' : 'Empty'}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-center flex-wrap">
            {canStart && (
              <button
                onClick={() => onPlayerAction('start_hand')}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium text-sm"
              >
                Start Game
              </button>
            )}
            {isAdmin && emptySeats >= 9 && (
              <button
                onClick={() => {
                  console.log('🎪 Clicked +9 AI button');
                  onPlayerAction('add_ai', { count: 9 });
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                +9 AI
              </button>
            )}
            {isAdmin && emptySeats >= 4 && (
              <button
                onClick={() => {
                  console.log('🎪 Clicked +4 AI button');
                  onPlayerAction('add_ai', { count: 4 });
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                +4 AI
              </button>
            )}
            {isAdmin && emptySeats > 0 && (
              <button
                onClick={() => {
                  console.log('🎪 Clicked Fill All button');
                  onPlayerAction('fill_ai');
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                Fill All
              </button>
            )}
            <button
              onClick={onStandUp}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== GROUP CARD SELECTION PHASE =====
  if (game.phase.includes('GroupSelection')) {
    const cardsToFlip = (game as any).cardsToFlip || [];
    const myCardToFlip = cardsToFlip.find((c: any) => c.playerId === meId);

    // Debug logging (commented out to reduce spam)
    // console.log('🎪 [GROUP SELECTION]', {
    //   phase: game.phase,
    //   cardsToFlip: cardsToFlip.map((c: any) => ({
    //     playerId: typeof c.playerId === 'string' ? c.playerId.slice(0, 8) : c.playerId,
    //     isGroupCard: c.card?.isGroupCard,
    //     category: c.card?.category,
    //     value: c.card?.value
    //   })),
    //   myCardToFlip: myCardToFlip ? {
    //     isGroupCard: myCardToFlip.card?.isGroupCard,
    //     category: myCardToFlip.card?.category,
    //     value: myCardToFlip.card?.value
    //   } : null
    // });

    if (myCardToFlip && myCardToFlip.card.isGroupCard) {
      const validCategories = activeCategories.filter(cat => cat.group === myCardToFlip.card.category);

      return (
        <div className="h-full flex flex-col md:flex-row gap-4 p-4 bg-slate-900">
          {/* Left side: Category scores for strategic decision making */}
          <div className="flex-1 bg-white rounded-lg shadow-lg p-6 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-slate-900">Category Standings</h2>
            <p className="text-sm text-slate-600 mb-4">Your current scores to help decide where to play your card:</p>
            <div className="space-y-4">
              {validCategories.map(cat => {
                const allScores = getAllCategoryScores(cat.name);
                const myScore = allScores.find(p => p.playerId === meId);
                const leaders = allScores.slice(0, 3);

                return (
                  <div key={cat.name} className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-slate-100 border-b border-slate-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img
                            src={getCardArt(cat.name.toLowerCase())}
                            alt=""
                            width="20"
                            height="20"
                            style={{ objectFit: 'contain' }}
                          />
                          <span className="text-sm font-bold text-slate-900">{cat.name}</span>
                        </div>
                        {myScore && (
                          <span className="text-sm font-bold text-purple-600">You: {myScore.score}</span>
                        )}
                      </div>
                    </div>
                    <div className="px-4 py-2 text-xs text-slate-700">
                      <div className="font-semibold mb-1">Leaders:</div>
                      {leaders.map((player, idx) => (
                        <div key={player.playerId} className={`flex justify-between ${player.playerId === meId ? 'font-bold text-purple-600' : ''}`}>
                          <span>{idx + 1}. {player.name}</span>
                          <span>{player.score}</span>
                        </div>
                      ))}
                      {allScores.length === 0 && <div className="text-slate-500 italic">No cards played yet</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right side: Card selection UI */}
          <div className="w-full md:w-96 bg-white rounded-lg shadow-lg p-8 flex flex-col justify-center">
            <h2 className="text-2xl font-bold mb-4">Select Category</h2>
            <p className="text-slate-600 mb-6">
              Your <span className="font-bold">{myCardToFlip.card.category}</span> group card (value: {myCardToFlip.card.value})
              is being revealed. Choose which category it should count towards:
            </p>

            <div className="space-y-3">
              {validCategories.map(cat => (
                <button
                  key={cat.name}
                  onClick={() => {
                    onPlayerAction('select_flip_category', { category: cat.name });
                  }}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-lg font-medium transition-colors"
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Countdown timer and progress bar */}
            {groupSelectionTimeRemaining !== null && (
              <div className="mt-6">
                <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all duration-100"
                    style={{
                      width: `${((game as any).groupSelectionTimeoutDuration ?
                        (groupSelectionTimeRemaining / (game as any).groupSelectionTimeoutDuration) * 100 :
                        0)}%`
                    }}
                  />
                </div>
                <div className="text-sm text-slate-500 text-center">
                  {groupSelectionTimeRemaining > 0
                    ? `⏱️ Auto-selects in ${Math.ceil(groupSelectionTimeRemaining / 1000)} second${Math.ceil(groupSelectionTimeRemaining / 1000) !== 1 ? 's' : ''}`
                    : '⏳ Processing...'}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    } else {
      // No group card for me, just waiting
      const groupCardPlayers = cardsToFlip.filter((c: any) => c.card?.isGroupCard);
      const humanGroupCardPlayers = groupCardPlayers.filter((c: any) => {
        const seat = game.seats.find((s: any) => s?.playerId === c.playerId);
        return seat && !seat.isAI;
      });

      return (
        <div className="h-full flex items-center justify-center bg-slate-900">
          <div className="text-center max-w-md p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Group Card Selection</h2>
            <p className="text-lg text-slate-300 mb-6">
              {humanGroupCardPlayers.length > 0
                ? `Waiting for ${humanGroupCardPlayers.length} player(s) to select categories for their group cards...`
                : 'AI players are selecting categories for their group cards...'}
            </p>

            {/* Countdown timer and progress bar */}
            {groupSelectionTimeRemaining !== null && (
              <div className="mb-6">
                <div className="w-full bg-slate-700 rounded-full h-3 mb-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-100"
                    style={{
                      width: `${((game as any).groupSelectionTimeoutDuration ?
                        (groupSelectionTimeRemaining / (game as any).groupSelectionTimeoutDuration) * 100 :
                        0)}%`
                    }}
                  />
                </div>
                <div className="text-base text-slate-300">
                  {groupSelectionTimeRemaining > 0
                    ? `⏱️ Auto-selecting in ${Math.ceil(groupSelectionTimeRemaining / 1000)} second${Math.ceil(groupSelectionTimeRemaining / 1000) !== 1 ? 's' : ''}`
                    : '⏳ Processing...'}
                </div>
              </div>
            )}
            {isAdmin && (
              <div className="mt-6 p-4 bg-slate-800 rounded-lg">
                <div className="text-xs text-slate-400 mb-2">Admin Info:</div>
                <div className="text-xs text-left text-slate-300">
                  {groupCardPlayers.map((c: any, idx: number) => {
                    const seat = game.seats.find((s: any) => s?.playerId === c.playerId);
                    return (
                      <div key={idx}>
                        {seat?.isAI ? '🤖' : '👤'} {seat?.name}: {c.card.category} {c.card.value}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
  }


  // ===== FAIR SUMMARY VIEW =====
  if (game.phase.startsWith('FairSummary')) {
    const fairResults = (game as any).fairResults || [];
    const fairNumber = (game as any).lastCompletedFair || 1;

    // Sort players by VP for display
    const sortedSeats = [...game.seats]
      .filter(s => s)
      .sort((a, b) => (b.totalVP || 0) - (a.totalVP || 0));

    // Medal emojis for top 3
    const getMedalEmoji = (rank: number) => {
      if (rank === 1) return '🥇';
      if (rank === 2) return '🥈';
      if (rank === 3) return '🥉';
      return '';
    };

    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="max-w-3xl w-full bg-white rounded-lg border-2 border-purple-300 shadow-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-purple-900 mb-2">🎪 Fair {fairNumber} Complete! 🎪</h1>
            <p className="text-slate-600">Category winners and ribbons awarded</p>
          </div>

          {/* Fair Results - Ribbons Won */}
          {fairResults && fairResults.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4 text-purple-800">🏆 Ribbons Awarded</h2>
              <div className="grid gap-3">
                {fairResults.map((result: any, idx: number) => (
                  <div
                    key={idx}
                    className="relative overflow-hidden bg-gradient-to-r from-purple-100 to-purple-50 border-2 border-purple-400 rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-4xl">{CATEGORY_EMOJIS[result.category] || '🎪'}</div>
                        <div>
                          <div className="text-lg font-bold text-purple-900">{result.category}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">🏅</span>
                            <span className="text-base font-semibold text-slate-700">{result.winner}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-purple-700">+{result.vp} VP</div>
                        <div className="text-sm text-slate-600 font-medium">{result.score} points</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Standings */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-purple-800">📊 Current Standings</h2>
            <div className="space-y-2">
              {sortedSeats.map((seat: any, idx: number) => {
                const medal = getMedalEmoji(idx + 1);
                const isLeader = idx === 0;
                return (
                  <div
                    key={seat.playerId}
                    className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                      seat.playerId === meId
                        ? 'bg-blue-100 border-blue-400 shadow-md'
                        : isLeader
                        ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-400 shadow-md ring-1 ring-amber-400/20'
                        : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {medal && <span className="text-2xl">{medal}</span>}
                      {!medal && <span className="text-lg font-bold text-slate-400">#{idx + 1}</span>}
                      <span className="text-xl">{seat.isAI ? '🤖' : '👤'}</span>
                      <span className="font-semibold text-lg">{seat.name}</span>
                    </div>
                    <div className={`text-2xl font-bold ${isLeader ? 'text-amber-700' : 'text-purple-600'}`}>
                      {seat.totalVP || 0} VP
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Continue Button */}
          <button
            onClick={() => onPlayerAction('continue_from_summary')}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 font-bold text-xl shadow-lg hover:shadow-xl transition-all"
          >
            {fairNumber >= 3 ? '🎊 View Final Results 🎊' : `✨ Continue to Fair ${fairNumber + 1} ✨`}
          </button>
        </div>
      </div>
    );
  }

  // ===== GAME END VIEW =====
  if (game.phase === 'GameEnd') {
    const gameWinners = (game as any).gameWinners || [];
    const winner = gameWinners[0];

    // Sort players by final VP
    const sortedSeats = [...game.seats]
      .filter(s => s)
      .sort((a, b) => (b.totalVP || 0) - (a.totalVP || 0));

    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="max-w-2xl w-full bg-white rounded-lg border border-slate-300 shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2">Game Over!</h1>
            {winner && (
              <>
                <p className="text-2xl text-purple-600 font-semibold">{winner.name} Wins!</p>
                <p className="text-lg text-slate-600 mt-2">{winner.payout / 10} Victory Points</p>
              </>
            )}
          </div>

          {/* Final Standings */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Final Standings</h2>
            <div className="space-y-2">
              {sortedSeats.map((seat: any, idx: number) => {
                const isWinner = idx === 0;
                return (
                  <div
                    key={seat.playerId}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isWinner
                        ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-400 shadow-lg ring-1 ring-amber-400/30'
                        : seat.playerId === meId
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">{isWinner ? '🏆' : `#${idx + 1}`}</span>
                      <span className="text-lg">{seat.isAI ? '🤖' : '👤'}</span>
                      <span className="font-medium text-lg">{seat.name}</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">{seat.totalVP || 0} VP</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Return to Lobby Button */}
          <button
            onClick={() => onPlayerAction('return_to_lobby')}
            className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold text-lg"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  // ===== UNSEATED PLAYER VIEW (not in lobby and not seated) =====
  if (!isSeated && game.phase !== 'Lobby') {
    const activePlayers = game.seats.filter(s => s && s.playerId);
    const humanPlayers = activePlayers.filter(s => !s.isAI);
    const aiPlayers = activePlayers.filter(s => s.isAI);

    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="max-w-2xl w-full bg-white rounded-lg border border-slate-300 shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-4 text-center">Game in Progress</h2>
          <p className="text-slate-600 mb-6 text-center">
            A game is currently underway. Please wait for the current game to finish before joining.
          </p>

          <div className="mb-6 p-4 bg-slate-50 rounded-lg">
            <div className="text-sm font-semibold text-slate-700 mb-2">Phase: {game.phase}</div>
            <div className="text-sm text-slate-600">
              Players: {activePlayers.length} ({humanPlayers.length} human, {aiPlayers.length} AI)
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-4">
              <div className="border-t border-slate-200 pt-4">
                <h3 className="font-semibold text-slate-700 mb-3">Active Players:</h3>
                <div className="space-y-2">
                  {activePlayers.map((seat, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <span>{seat.isAI ? '🤖' : '👤'}</span>
                        <span className="font-medium">{seat.name}</span>
                        <span className="text-xs text-slate-500">({seat.playerId.slice(0, 8)})</span>
                      </div>
                      <span className="text-sm text-slate-600">{seat.totalVP || 0} VP</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="font-semibold text-slate-700 mb-2">Admin Controls:</h3>
                <button
                  onClick={() => onPlayerAction('admin_reset_game')}
                  className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  Force Reset to Lobby
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== DERIVED DISPLAY DATA =====
  const hasActed = mySeat?.hasActed || false;
  const waitingForOthers = hasActed;

  // Debug logging removed - was causing spam on every render/mouseover

  // Calculate per-category leaders for CURRENT FAIR only
  const getCategoryLeaders = (categoryName: string) => {
    const playerScores: Array<{ name: string; score: number; playerId: string }> = [];

    game.seats.forEach(seat => {
      if (seat && seat.playedCards) {
        // Only count cards played in the current fair
        const score = seat.playedCards
          .filter(card => {
            const effectiveCategory = card.selectedCategory || card.category;
            return effectiveCategory === categoryName && card.playedAtFair === currentFair;
          })
          .reduce((sum, card) => sum + card.value, 0);
        if (score > 0) {
          playerScores.push({ name: seat.name, score, playerId: seat.playerId });
        }
      }
    });

    return playerScores.sort((a, b) => b.score - a.score).slice(0, 3);
  };

  // Get all player scores for popover (derived from existing data)
  const getAllCategoryScores = (categoryName: string) => {
    const playerScores: Array<{ name: string; score: number; delta: number; playerId: string }> = [];

    game.seats.forEach(seat => {
      if (seat && seat.playedCards) {
        // Calculate total score for this category
        const categoryCards = seat.playedCards.filter(card => {
          // For group cards, use selectedCategory; otherwise use category
          const effectiveCategory = card.selectedCategory || card.category;
          return effectiveCategory === categoryName;
        });

        let score = categoryCards.reduce((sum, card) => sum + card.value, 0);

        // Add face-down cards that will flip in upcoming rounds (for the player's view only)
        if (seat.playerId === meId) {
          const faceDownCategoryCards = allMyFaceDownCards.filter((card: any) => {
            const effectiveCategory = card.selectedCategory || card.category;
            return effectiveCategory === categoryName;
          });
          score += faceDownCategoryCards.reduce((sum: number, card: any) => sum + card.value, 0);
        }

        // Calculate delta (cards played in current round)
        const delta = categoryCards
          .filter(card => card.playedAtFair === currentFair && card.playedAtRound === currentRound)
          .reduce((sum, card) => sum + card.value, 0);

        if (score > 0) {
          playerScores.push({ name: seat.name, score, delta, playerId: seat.playerId });
        }
      }
    });

    return playerScores.sort((a, b) => b.score - a.score);
  };

  // Filter board players based on tab
  const getBoardPlayers = () => {
    const allPlayers = game.seats.filter(s => s && s.playerId);

    if (boardTab === 'you') {
      return allPlayers.filter(s => s.playerId === meId);
    }

    if (boardTab === 'rivals') {
      // Show all players except me
      return allPlayers.filter(s => s.playerId !== meId);
    }

    return allPlayers;
  };

  const boardPlayers = getBoardPlayers();

  // ===== MAIN GAME VIEW - LAYOUT ONLY, PRESERVE ALL LOGIC =====
  return (
    <div className="app-shell h-full flex flex-col">
      {/* Top bar - UNCHANGED as per spec */}
      <div className="h-11 bg-white border-b border-slate-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Fair {currentFair} · Round {currentRound}</h1>
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">{mySeat?.name}</span>
          <span className="text-xs text-slate-600">{myTotalVP} VP</span>
        </div>
        <button
          onClick={() => setShowStandings(!showStandings)}
          className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded"
          aria-label="Toggle stats drawer"
        >
          Stats
        </button>
      </div>

      {/* Main content - max-width 1280px, stacked sections */}
      <div className="flex-1 overflow-auto pb-24">
        <div className="page">

          {/* Categories Section */}
          <section className="section-categories">
            <h2 className="text-xl mb-4 font-semibold text-white">Categories</h2>
            {/* Group categories by group */}
            {(() => {
              const groupedCategories = activeCategories.reduce((acc, cat) => {
                if (!acc[cat.group]) acc[cat.group] = [];
                acc[cat.group].push(cat);
                return acc;
              }, {} as Record<string, typeof activeCategories>);

              const sortedGroups = Object.keys(groupedCategories).sort();

              return sortedGroups.map(groupName => (
                <div key={groupName} className="mb-6">
                  {/* Group Header */}
                  <h3 className="text-base font-semibold text-white mb-3 px-2">{groupName}</h3>

                  {/* Categories in this group */}
                  <div className="category-grid">
                    {groupedCategories[groupName].map(cat => {
                      const emoji = CATEGORY_EMOJIS[cat.name] || '';
                      const prestige = categoryPrestige[cat.name] || 0;
                      const leaders = getCategoryLeaders(cat.name);
                      const topScore = leaders[0]?.score || 0;
                      const allScores = getAllCategoryScores(cat.name);

                return (
                  <div
                    key={cat.name}
                    className="relative"
                  >
                    <div
                      className="category-tile"
                      onMouseEnter={() => setHoveredCategory(cat.name)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                    >
                      <div className="left">
                        {/* P0: Scoring dot - show if this category scores this round */}
                        {currentRound <= 3 && <div className="scoring-dot"></div>}
                        <img className="icon-24" src={getCardArt(cat.name.toLowerCase())} alt="" />
                        <div className="name-group">
                          <div className="name">{cat.name}</div>
                          <div className="sub">{cat.group}</div>
                        </div>
                      </div>
                      <div className="right">
                        {/* Show top 3 leaders */}
                        {leaders.length > 0 && (
                          <>
                            <LeaderChip avatarText={leaders[0].name.charAt(0)} points={leaders[0].score} />
                            {leaders.length > 1 && (
                              <>
                                <LeaderChip avatarText={leaders[1].name.charAt(0)} points={leaders[1].score} />
                                {leaders.length > 2 && (
                                  <LeaderChip avatarText={leaders[2].name.charAt(0)} points={leaders[2].score} />
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Popover on hover - follows mouse */}
                    {hoveredCategory === cat.name && allScores.length > 0 && (
                      <div
                        className="fixed z-50 w-72 rounded-lg shadow-2xl overflow-hidden pointer-events-none"
                        style={{
                          left: `${Math.min(mousePos.x + 10, window.innerWidth - 300)}px`,
                          top: `${Math.min(mousePos.y + 10, window.innerHeight - 300)}px`,
                          backgroundColor: 'rgba(255, 255, 255, 0.98)',
                          border: '3px solid rgb(100, 116, 139)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        }}
                      >
                        <div className="px-4 py-3 border-b-2 border-slate-400" style={{ backgroundColor: 'rgba(241, 245, 249, 0.98)' }}>
                          <div className="flex items-center gap-2">
                            <img
                              src={getCardArt(cat.name.toLowerCase())}
                              alt=""
                              width="20"
                              height="20"
                              style={{ objectFit: 'contain' }}
                            />
                            <span className="text-sm font-bold text-slate-900">{cat.name}</span>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto" style={{ backgroundColor: 'rgba(255, 255, 255, 0.98)' }}>
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 border-b-2 border-slate-300" style={{ backgroundColor: 'rgba(241, 245, 249, 0.98)' }}>
                              <tr>
                                <th className="text-left px-4 py-2 font-semibold text-slate-900">Player</th>
                                <th className="text-right px-4 py-2 font-semibold text-slate-900">Total</th>
                                <th className="text-right px-4 py-2 font-semibold text-slate-900">Round Δ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* P1: Your standing - sticky first row if player exists in this category */}
                              {allScores.find(p => p.playerId === meId) && (() => {
                                const myScore = allScores.find(p => p.playerId === meId)!;
                                return (
                                  <tr className="sticky top-[33px] z-10 popover-your-standing border-b-2 border-slate-300">
                                    <td className="px-4 py-2 font-bold text-slate-900">You</td>
                                    <td className="px-4 py-2 text-right font-bold text-slate-900">{myScore.score}</td>
                                    <td className="px-4 py-2 text-right font-semibold text-green-700">
                                      {myScore.delta > 0 && `+${myScore.delta}`}
                                    </td>
                                  </tr>
                                );
                              })()}
                              {allScores.map((player, idx) => (
                                <tr
                                  key={player.playerId}
                                  className={`border-t border-slate-200 ${player.playerId === meId ? 'hidden' : ''}`}
                                >
                                  <td className="px-4 py-2 font-medium text-slate-900">{player.name}</td>
                                  <td className="px-4 py-2 text-right font-bold text-slate-900">{player.score}</td>
                                  <td className="px-4 py-2 text-right text-slate-600">
                                    {player.delta > 0 && `+${player.delta}`}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
                  </div>
                </div>
              ));
            })()}
          </section>

          {/* Board Section */}
          <section className="section-board">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Board</h2>
              {/* P1: Tabs with consistent styling and aria-selected */}
              <div className="tabs">
                <button
                  onClick={() => setBoardTab('all')}
                  className="tab"
                  aria-selected={boardTab === 'all'}
                >
                  All
                </button>
                <button
                  onClick={() => setBoardTab('you')}
                  className="tab"
                  aria-selected={boardTab === 'you'}
                >
                  You
                </button>
                <button
                  onClick={() => setBoardTab('rivals')}
                  className="tab"
                  aria-selected={boardTab === 'rivals'}
                >
                  Rivals
                </button>
              </div>
            </div>
            <div className="panel board-panel board-rows">
              {boardPlayers.map((seat: any) => {
                // Show all cards played in the current fair
                const currentFairCards = (seat.playedCards || []).filter((card: any) =>
                  card.playedAtFair === currentFair
                );

                // Face-down cards that will flip in upcoming rounds of THIS Fair
                const faceDownCards = (seat as any).faceDownCards || [];
                const isMyCards = seat.playerId === meId;

                return (
                  <div key={seat.playerId} className="row">
                    <div className="w-6 h-6 rounded-full bg-slate-400 flex items-center justify-center text-xs font-bold text-white">
                      {seat.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-white">{seat.name}</span>
                    <div className="chips">
                      {currentFairCards.length > 0 && currentFairCards.map((card: any, idx: number) => {
                        const effectiveCategory = card.selectedCategory || card.category;
                        // For unselected group cards, use 'unknown' as categoryId
                        const isUnselectedGroupCard = card.isGroupCard && !card.selectedCategory;
                        return (
                          <MiniCardChip
                            key={`up-${idx}`}
                            categoryId={isUnselectedGroupCard ? 'unknown' : effectiveCategory.toLowerCase()}
                            value={card.value}
                          />
                        );
                      })}
                      {/* Show face-down cards for this Fair */}
                      {faceDownCards.length > 0 && faceDownCards.map((card: any, idx: number) => (
                        isMyCards ? (
                          // Show my face-down cards with details
                          <MiniCardChip
                            key={`down-${idx}`}
                            categoryId={card.selectedCategory ? card.selectedCategory.toLowerCase() : (card.category ? card.category.toLowerCase() : 'unknown')}
                            value={card.value}
                          />
                        ) : (
                          // Show opponent face-down cards as card backs
                          <div key={`down-${idx}`} className="mini-chip">
                            <img src="/assets/card_art/card_back.png" alt="Face-down card" />
                            <span className="val">?</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Hand Section */}
          <section className="section-hand">
            <div className="panel overflow-hidden">
              <div className="px-4 pt-3 pb-0">
                {/* P1: Tabs with consistent styling */}
                <div className="tabs">
                  <button
                    onClick={() => setActiveTab('hand')}
                    className="tab"
                    aria-selected={activeTab === 'hand'}
                  >
                    Hand
                  </button>
                  <button
                    onClick={() => setActiveTab('played')}
                    className="tab"
                    aria-selected={activeTab === 'played'}
                  >
                    Plays
                  </button>
                </div>
                {/* P0: Helper text under tabs */}
                {activeTab === 'hand' && !waitingForOthers && myHand.length > 0 && (
                  <div className="hand-helper">
                    {currentFair < 3
                      ? 'Play 1 face-up for this fair and 1 face-down for the next fair.'
                      : 'Play 1 face-up card for this fair.'}
                  </div>
                )}
              </div>

              <div className="p-4">
                {activeTab === 'hand' ? (
                  waitingForOthers ? (
                    <div className="empty-state">Waiting for others...</div>
                  ) : myHand.length === 0 ? (
                    <div className="empty-state">No cards in hand.</div>
                  ) : (
                    <div className="hand-grid">
                      {myHand.map((card, i) => {
                        const isSelected = slotA?.index === i || slotB?.index === i;
                        // Get effective category (handles group cards)
                        const effectiveCategory = card.selectedCategory || card.category;
                        const displayName = card.isGroupCard ? `${card.category} (Group)` : card.category;
                        // Find the group for this category
                        const categoryInfo = activeCategories.find(cat => cat.name === effectiveCategory);
                        return (
                          <CardShell
                            key={i}
                            categoryId={effectiveCategory.toLowerCase()}
                            name={displayName}
                            group={categoryInfo?.group}
                            value={card.value}
                            isGroupCard={card.isGroupCard}
                            selected={isSelected}
                            onClick={() => selectCard(card, i)}
                          />
                        );
                      })}
                    </div>
                  )
                ) : (
                  myPlayedCards.length === 0 && myFaceDownCards.length === 0 ? (
                    <div className="empty-state">No plays yet</div>
                  ) : (
                    <div className="space-y-4">
                      {/* Group played cards by fair */}
                      {[1, 2, 3].map(fairNum => {
                        const cardsInFair = myPlayedCards.filter((c: any) => c.playedAtFair === fairNum);
                        if (cardsInFair.length === 0) return null;

                        return (
                          <div key={fairNum}>
                            <div className="text-sm font-semibold text-slate-700 mb-3">Fair {fairNum}</div>
                            <div className="grid grid-cols-3 gap-3">
                              {cardsInFair.map((card: any, i: number) => {
                                const effectiveCategory = card.selectedCategory || card.category;
                                const categoryInfo = activeCategories.find((cat: any) => cat.name === effectiveCategory);
                                const isUnselectedGroupCard = card.isGroupCard && !card.selectedCategory;
                                const displayName = isUnselectedGroupCard ? `${effectiveCategory} (Group)` : effectiveCategory;
                                return (
                                  <div key={`up-${fairNum}-${i}`} className="relative">
                                    <CardShell
                                      categoryId={isUnselectedGroupCard ? 'unknown' : effectiveCategory.toLowerCase()}
                                      name={displayName}
                                      group={isUnselectedGroupCard ? effectiveCategory : categoryInfo?.group}
                                      value={card.value}
                                      isGroupCard={card.isGroupCard}
                                      selected={false}
                                    />
                                    <div className="absolute bottom-1 right-1 bg-slate-800/80 text-white text-xs px-2 py-0.5 rounded">
                                      Round {card.playedAtRound}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* Face-down cards (includes card being flipped during GroupSelection) */}
                      {allMyFaceDownCards.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-slate-700 mb-3">Face-Down (Future Rounds)</div>
                          <div className="grid grid-cols-3 gap-3">
                            {allMyFaceDownCards.map((card: any, i: number) => {
                              // For group cards without selectedCategory, use the group name
                              const effectiveCategory = card.selectedCategory || card.category;
                              // For group cards, effectiveCategory might be the group name, not a category name
                              const categoryInfo = activeCategories.find((cat: any) => cat.name === effectiveCategory);
                              const isUnselectedGroupCard = card.isGroupCard && !card.selectedCategory;
                              const displayName = isUnselectedGroupCard ? `${effectiveCategory} (Group)` : effectiveCategory;

                              return (
                                <div key={`down-${i}`} className="relative">
                                  <CardShell
                                    categoryId={isUnselectedGroupCard ? 'unknown' : effectiveCategory.toLowerCase()}
                                    name={displayName}
                                    group={isUnselectedGroupCard ? effectiveCategory : categoryInfo?.group}
                                    value={card.value}
                                    isGroupCard={card.isGroupCard}
                                    selected={false}
                                  />
                                  <div className="absolute bottom-1 right-1 bg-slate-800/80 text-white text-xs px-2 py-0.5 rounded">
                                    Fair {card.playedFaceDownAtFair + 1}, Round {card.playedFaceDownAtRound}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* Fixed Bottom Action Bar - PRESERVE ALL HANDLERS */}
      {!waitingForOthers && myHand.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-300 shadow-lg px-4 py-3 z-20">
          <div className="max-w-[1280px] mx-auto flex items-center gap-4">
            {/* Slot A */}
            {slotA ? (
              !isFaceUp ? (
                <div className="slot-mini">
                  <img src="/assets/card_art/card_back.png" alt="Card back" />
                  <div className="next-chip">next fair</div>
                </div>
              ) : (
                <div className="slot-mini">
                  <img src={getCardArt((slotA.card.getEffectiveCategory ? slotA.card.getEffectiveCategory() : slotA.card.category).toLowerCase())} alt="" />
                  {slotA.card.isGroupCard && (
                    <div className="absolute top-1 left-1 bg-amber-300 px-1 py-0.5 rounded text-xs font-bold text-amber-900">
                      {slotA.card.category}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="slot-mini">
                <span className="text-xs text-slate-400">Slot A</span>
              </div>
            )}

            {/* Slot B - only show in Fairs 1 & 2 */}
            {currentFair < 3 && (
              slotB ? (
                isFaceUp ? (
                  // When A is face-up, B is face-down (next fair)
                  <div className="slot-mini">
                    <img src="/assets/card_art/card_back.png" alt="Card back" />
                    <div className="next-chip">next fair</div>
                  </div>
                ) : (
                  // When A is face-down, B is face-up (current fair)
                  <div className="slot-mini">
                    <img src={getCardArt((slotB.card.getEffectiveCategory ? slotB.card.getEffectiveCategory() : slotB.card.category).toLowerCase())} alt="" />
                    {slotB.card.isGroupCard && (
                      <div className="absolute top-1 left-1 bg-amber-300 px-1 py-0.5 rounded text-xs font-bold text-amber-900">
                        {slotB.card.category}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="slot-mini">
                  <span className="text-xs text-slate-400">Slot B</span>
                </div>
              )
            )}

            {/* Face-Up Toggle - only show in Fairs 1 & 2 */}
            {currentFair < 3 && (
              <button
                onClick={() => setIsFaceUp(!isFaceUp)}
                className={`px-4 py-3 rounded-lg text-sm font-medium min-w-[100px] ${
                  isFaceUp ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
                aria-label={isFaceUp ? 'Slot A is face-up' : 'Slot B is face-up'}
              >
                {isFaceUp ? 'A Face-Up' : 'B Face-Up'}
              </button>
            )}

            {/* Group Card Category Selection */}
            {/* NOTE: Selection happens for face-UP cards that score immediately */}
            {/* Face-down cards will have their category selected when they flip in future fairs */}
            {/* Slot A selector - shows based on which card will be face-up */}
            {/* When isFaceUp is true, A is face-up, so show selector for A if it's a group card */}
            {slotA && slotA.card.isGroupCard && isFaceUp && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">
                  Face-Up Card ({slotA.card.category}) Category:
                </label>
                <select
                  value={groupSelections.slotA || ''}
                  onChange={(e) => setGroupSelections(prev => ({ ...prev, slotA: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                >
                  <option value="">Choose...</option>
                  {activeCategories
                    .filter(cat => cat.group === slotA.card.category)
                    .map(cat => (
                      <option key={cat.name} value={cat.name}>{cat.name}</option>
                    ))
                  }
                </select>
              </div>
            )}

            {/* Slot B selector only shows if slot B is face-up (scoring this round) */}
            {/* B is face-up when A is face-down (when isFaceUp is false) */}
            {slotB && slotB.card.isGroupCard && !isFaceUp && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-700">
                  Face-Up Card ({slotB.card.category}) Category:
                </label>
                <select
                  value={groupSelections.slotB || ''}
                  onChange={(e) => setGroupSelections(prev => ({ ...prev, slotB: e.target.value }))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                >
                  <option value="">Choose...</option>
                  {activeCategories
                    .filter(cat => cat.group === slotB.card.category)
                    .map(cat => (
                      <option key={cat.name} value={cat.name}>{cat.name}</option>
                    ))
                  }
                </select>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={submitCards}
              disabled={!canSubmit}
              className={`btn ${canSubmit ? 'btn-primary' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
              aria-label="Submit selected cards"
            >
              Submit
            </button>

            {/* Clear */}
            <button
              onClick={clearSelection}
              className="px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 text-sm font-medium"
              aria-label="Clear selection"
            >
              Clear
            </button>

            {/* Leave */}
            <button
              onClick={onStandUp}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
              aria-label="Leave game"
            >
              Leave
            </button>
          </div>
        </div>
      )}

      {/* Round Summary Overlay */}
      {game.phase.startsWith('RoundSummary') && (
        <RoundSummaryOverlay
          roundNumber={(game as any).completedRound || 1}
          onContinue={() => onPlayerAction('continue_from_summary')}
        />
      )}
    </div>
  );
}
