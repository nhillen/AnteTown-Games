import React, { useState, useEffect } from 'react';
import type { GameState, Seat } from '@antetown/game-sdk';
import type { Card as CardType, PokerPhase, PokerAction, ActiveSideGame } from './types';
import { PropBetProposalModal } from './components/PropBetProposalModal';
import { PropBetSelectionMenu } from './components/PropBetSelectionMenu';
import { PropBetNotification } from './components/PropBetNotification';
import { ThemeProvider } from './themes/ThemeProvider';
import { TableStage } from './ui/table/TableStage';
import { HudOverlay } from './ui/hud/HudOverlay';
import { SeatBadge } from './ui/hud/SeatBadge';
import { PotBadge } from './ui/hud/PotBadge';
import { ActionBar } from './ui/hud/ActionBar';
import { TimerRing } from './ui/hud/TimerRing';
import { Card } from './ui/cards/Card';

interface PokerSeat extends Seat {
  holeCards?: CardType[];
  lastAction?: PokerAction;
  sidePot?: {
    balance: number;
    committed: number;
  };
}

interface HouseRulesGameState extends GameState {
  phase: PokerPhase;
  seats: PokerSeat[];
  communityCards?: CardType[];
  smallBlind?: number;
  bigBlind?: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  dealerSeatIndex?: number;
  activeSideGames?: ActiveSideGame[];
  variant?: string;
  turnEndsAtMs?: number;
  currentTurnPlayerId?: string;
}

export interface PokerClientProps {
  gameState: HouseRulesGameState | null;
  myPlayerId: string;
  onAction: (action: PokerAction, amount?: number) => void;
  onSitDown?: (seatIndex: number, buyInAmount: number) => void;
  onStandUp?: () => void;
  isSeated?: boolean;
  onProposeSideGame?: (type: string, config: any) => void;
  onRespondToSideGame?: (sideGameId: string, response: 'in' | 'out') => void;
}

// Map poker variant to theme
function getThemeForVariant(variant?: string): string {
  switch (variant) {
    case 'squid-game': return 'squid';
    case 'roguelike': return 'roguelike';
    case 'texas-holdem':
    default: return 'casino';
  }
}

const PokerClient: React.FC<PokerClientProps> = ({
  gameState,
  myPlayerId,
  onAction,
  onStandUp,
  isSeated,
  onProposeSideGame,
  onRespondToSideGame
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [queuedAction, setQueuedAction] = useState<'fold' | 'check' | 'check_fold' | null>(null);
  const [showPropBetSelectionMenu, setShowPropBetSelectionMenu] = useState(false);
  const [showPropBetModal, setShowPropBetModal] = useState(false);
  const [selectedPropBet, setSelectedPropBet] = useState<string | null>(null);
  const [lastLoggedPhase, setLastLoggedPhase] = useState<string>('');

  if (!gameState) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-gray-900 rounded-3xl">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  // Diagnostic log (once per phase change)
  useEffect(() => {
    if (gameState && gameState.phase !== lastLoggedPhase) {
      setLastLoggedPhase(gameState.phase);
      const mySeat = gameState.seats.find((s: any) => s && s.playerId === myPlayerId);
      console.log('🎴 Poker Diagnostic:', {
        phase: gameState.phase,
        myPlayerId,
        mySeat: mySeat ? {
          seatIndex: gameState.seats.indexOf(mySeat),
          playerId: mySeat.playerId,
          hasHoleCards: !!mySeat.holeCards,
          holeCards: mySeat.holeCards
        } : 'NOT SEATED',
        currentTurnPlayerId: gameState.currentTurnPlayerId,
        isMyTurn: gameState.currentTurnPlayerId === myPlayerId
      });
    }
  }, [gameState?.phase, myPlayerId, lastLoggedPhase]);

  // Turn timer countdown
  useEffect(() => {
    if (!gameState?.turnEndsAtMs) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, gameState.turnEndsAtMs! - Date.now());
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [gameState?.turnEndsAtMs]);

  // Auto-execute queued action
  useEffect(() => {
    if (!gameState || !queuedAction) return;

    const mySeat = gameState.seats?.find((s: any) => s && s.playerId === myPlayerId);
    const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;

    if (isMyTurn && mySeat && !mySeat.hasFolded) {
      const callAmount = (gameState.currentBet || 0) - (mySeat.currentBet || 0);
      const canCheck = callAmount === 0;

      if (queuedAction === 'fold') {
        onAction('fold');
        setQueuedAction(null);
      } else if (queuedAction === 'check') {
        if (canCheck) {
          onAction('check');
          setQueuedAction(null);
        } else {
          setQueuedAction(null); // Cancel if can't check
        }
      } else if (queuedAction === 'check_fold') {
        if (canCheck) {
          onAction('check');
        } else {
          onAction('fold');
        }
        setQueuedAction(null);
      }
    }
  }, [gameState?.currentTurnPlayerId, queuedAction, myPlayerId, gameState, onAction]);

  // Emit poker state to platform overlay
  useEffect(() => {
    const mySeat = gameState?.seats?.find((s: any) => s && s.playerId === myPlayerId);
    const isSeatedNow = !!mySeat && !mySeat.hasFolded;

    window.dispatchEvent(new CustomEvent('poker:stateUpdate', {
      detail: {
        isSeated: isSeatedNow,
        isStanding: !isSeatedNow && isSeated // Was seated but now not
      }
    }));
  }, [gameState?.seats, myPlayerId, isSeated]);

  // Listen for platform overlay events
  useEffect(() => {
    const handlePropBetMenu = () => {
      console.log('🎴 Opening prop bet menu from platform overlay');
      setShowPropBetSelectionMenu(true);
    };

    const handleStandUp = (e: any) => {
      const { afterHand, immediate } = e.detail || {};
      console.log('🚶 Standing up from platform overlay', { afterHand, immediate });

      if (immediate) {
        // Immediate: Fold if it's my turn or queue a fold
        const mySeat = gameState?.seats?.find((s: any) => s && s.playerId === myPlayerId);
        if (mySeat && !mySeat.hasFolded) {
          if (gameState?.currentTurnPlayerId === myPlayerId) {
            console.log('🃏 Folding immediately');
            onAction('fold');
          } else {
            console.log('🃏 Queueing fold for next turn');
            setQueuedAction('fold');
          }
        }
      }

      // Stand up (backend will handle afterHand vs immediate)
      if (onStandUp) {
        onStandUp({ afterHand, immediate });
      }
    };

    window.addEventListener('poker:openPropBetMenu', handlePropBetMenu);
    window.addEventListener('poker:standUp', handleStandUp);

    return () => {
      window.removeEventListener('poker:openPropBetMenu', handlePropBetMenu);
      window.removeEventListener('poker:standUp', handleStandUp);
    };
  }, [onStandUp, onAction, gameState, myPlayerId, setQueuedAction]);

  const theme = getThemeForVariant(gameState.variant);

  return (
    <ThemeProvider defaultTheme={theme}>
      <div className="w-full space-y-4">
        <TableStage>
          {/* Pot Badge */}
          <div style={{ position: 'absolute', top: '70%', left: '50%', transform: 'translateX(-50%)' }}>
            <PotBadge amount={gameState.pot} />
          </div>

          {/* Community Cards */}
          {gameState.communityCards && gameState.communityCards.length > 0 && (
            <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translateX(-50%)' }}>
              <div className="flex justify-center gap-3">
                {gameState.communityCards.map((card: CardType, i: number) => (
                  <Card
                    key={i}
                    rank={card.rank}
                    suit={card.suit}
                    size="large"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Seats */}
          {gameState.seats.map((seat: any, idx: number) => {
            const totalSeats = gameState.seats.length;
            const angle = (idx / totalSeats) * 2 * Math.PI - Math.PI / 2;
            const radiusX = 42;
            const radiusY = 32;
            const x = 50 + radiusX * Math.cos(angle);
            const y = 50 + radiusY * Math.sin(angle);

            const isMe = seat && seat.playerId === myPlayerId;
            const isCurrentTurn = seat && gameState.currentTurnPlayerId === seat.playerId;
            const isDealer = gameState.dealerSeatIndex === idx;
            const hasFolded = seat && seat.hasFolded;

            const sbIndex = ((gameState.dealerSeatIndex || 0) + 1) % totalSeats;
            const bbIndex = ((gameState.dealerSeatIndex || 0) + 2) % totalSeats;
            const isSmallBlind = idx === sbIndex;
            const isBigBlind = idx === bbIndex;

            const position = y < 50 ? 'top' : 'bottom';

            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  {/* Hole cards */}
                  {seat && seat.holeCards && seat.holeCards.length > 0 && !hasFolded && position === 'top' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {seat.holeCards.map((card: CardType, cardIdx: number) => (
                        <Card
                          key={cardIdx}
                          rank={card.rank}
                          suit={card.suit}
                          faceDown={!isMe && gameState.phase !== 'Showdown'}
                          size="small"
                        />
                      ))}
                    </div>
                  )}

                  {seat ? (
                    <SeatBadge
                      name={seat.name}
                      stack={seat.tableStack ?? seat.chips ?? seat.bankroll ?? 0}
                      dealer={isDealer}
                      smallBlind={isSmallBlind}
                      bigBlind={isBigBlind}
                      active={isCurrentTurn}
                      folded={hasFolded}
                      position={position}
                    />
                  ) : (
                    <div className="px-4 py-2 text-gray-500 bg-slate-900/30 border border-dashed border-slate-700 rounded-lg text-sm">
                      Empty
                    </div>
                  )}

                  {seat && seat.holeCards && seat.holeCards.length > 0 && !hasFolded && position === 'bottom' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {seat.holeCards.map((card: CardType, cardIdx: number) => (
                        <Card
                          key={cardIdx}
                          rank={card.rank}
                          suit={card.suit}
                          faceDown={!isMe && gameState.phase !== 'Showdown'}
                          size="small"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </TableStage>

        {/* HUD Overlay */}
        <HudOverlay>
          {(() => {
            const mySeat = gameState.seats.find((s: any) => s && s.playerId === myPlayerId);
            const hasFolded = mySeat?.hasFolded || false;
            const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;

            return isSeated && gameState.phase !== 'Lobby' && !hasFolded && (
              <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ActionBar
                  key={`action-bar-${isMyTurn ? 'my-turn' : 'not-my-turn'}`}
                  onFold={() => onAction('fold')}
                  onCall={() => {
                    const callAmount = (gameState.currentBet || 0) - (mySeat?.currentBet || 0);
                    onAction('call', callAmount);
                  }}
                  onCheck={() => onAction('check')}
                  onRaise={(amount) => onAction('raise', amount)}
                  callAmount={(gameState.currentBet || 0) - (mySeat?.currentBet || 0)}
                  minRaise={(gameState.currentBet || 0) + (gameState.bigBlind || 0)}
                  maxRaise={mySeat?.tableStack || 0}
                  currentBet={gameState.currentBet || 0}
                  pot={gameState.pot}
                  disabled={!isMyTurn}
                  queuedAction={queuedAction}
                  onQueueAction={setQueuedAction}
                />
                {timeRemaining > 0 && isMyTurn && (
                  <TimerRing timeRemaining={timeRemaining} totalTime={15000} />
                )}
              </div>
            );
          })()}

        </HudOverlay>
      </div>

      {/* Prop Bet Modals */}
      {gameState && onProposeSideGame && (
        <>
          <PropBetSelectionMenu
            isOpen={showPropBetSelectionMenu}
            onClose={() => setShowPropBetSelectionMenu(false)}
            onSelectPropBet={(propBetType: string) => {
              setSelectedPropBet(propBetType);
              setShowPropBetModal(true);
            }}
          />

          {selectedPropBet === 'flipz' && (
            <PropBetProposalModal
              isOpen={showPropBetModal}
              onClose={() => {
                setShowPropBetModal(false);
                setSelectedPropBet(null);
              }}
              onPropose={(type: string, config: any) => {
                onProposeSideGame(type, config);
                setShowPropBetModal(false);
                setSelectedPropBet(null);
              }}
              myPlayerId={myPlayerId}
              sidePotBalance={(() => {
                const mySeat = gameState.seats.find((s: any) => s && s.playerId === myPlayerId);
                return mySeat?.sidePot?.balance || 0;
              })()}
              bigBlind={gameState.bigBlind || 100}
            />
          )}
        </>
      )}

      {/* Prop bet notifications */}
      {gameState.activeSideGames && onRespondToSideGame && gameState.activeSideGames.map((sg: ActiveSideGame) => {
        // Find proposer's name from seats
        const proposerSeat = gameState.seats.find((s: any) => s && s.playerId === sg.proposedBy);
        const proposerName = proposerSeat?.name || 'Unknown';

        return (
          <PropBetNotification
            key={sg.id}
            sideGame={sg}
            myPlayerId={myPlayerId}
            proposerName={proposerName}
            onRespond={onRespondToSideGame}
          />
        );
      })}
    </ThemeProvider>
  );
};

export default PokerClient;
