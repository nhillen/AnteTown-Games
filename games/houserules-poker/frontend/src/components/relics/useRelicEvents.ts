import { useState, useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  PlayerRelic,
  DraftOptions,
  RoguelikeState,
  RelicRarity,
} from './types';
import type { RelicNotificationData } from './RelicNotification';

/**
 * State managed by the useRelicEvents hook
 */
export interface RelicEventState {
  /** Player's own relics */
  myRelics: PlayerRelic[];
  /** Current draft options (null when not in draft) */
  draftOptions: DraftOptions | null;
  /** Whether player has made their draft selection */
  hasSelectedDraft: boolean;
  /** Roguelike session state */
  roguelikeState: RoguelikeState | null;
  /** Whether in a rogue break */
  isInRogueBreak: boolean;
  /** Active notifications */
  notifications: Array<RelicNotificationData & { id: string }>;
  /** Show rogue break announcement */
  showBreakAnnouncement: boolean;
  /** Current break number for announcement */
  breakAnnouncementNumber: number;
}

/**
 * Actions available from the hook
 */
export interface RelicEventActions {
  /** Select a relic during draft */
  selectRelic: (relicId: string) => void;
  /** Activate a triggered relic */
  activateRelic: (relicId: string) => void;
  /** Dismiss a notification */
  dismissNotification: (id: string) => void;
  /** Hide break announcement */
  hideBreakAnnouncement: () => void;
}

/**
 * Hook for managing relic events via Socket.IO
 */
export function useRelicEvents(
  socket: Socket | null,
  myPlayerId: string
): [RelicEventState, RelicEventActions] {
  const [myRelics, setMyRelics] = useState<PlayerRelic[]>([]);
  const [draftOptions, setDraftOptions] = useState<DraftOptions | null>(null);
  const [hasSelectedDraft, setHasSelectedDraft] = useState(false);
  const [roguelikeState, setRoguelikeState] = useState<RoguelikeState | null>(null);
  const [isInRogueBreak, setIsInRogueBreak] = useState(false);
  const [notifications, setNotifications] = useState<Array<RelicNotificationData & { id: string }>>([]);
  const [showBreakAnnouncement, setShowBreakAnnouncement] = useState(false);
  const [breakAnnouncementNumber, setBreakAnnouncementNumber] = useState(0);

  const notificationIdRef = useRef(0);

  // Add notification helper
  const addNotification = useCallback((data: RelicNotificationData) => {
    const id = `notification-${++notificationIdRef.current}`;
    setNotifications((prev) => [...prev, { ...data, id }]);
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Rogue Break triggered - show announcement
    const handleRogueBreakTriggered = (data: { breakNumber: number; trigger: string }) => {
      console.log('🎴 Rogue Break triggered:', data);
      setBreakAnnouncementNumber(data.breakNumber);
      setShowBreakAnnouncement(true);
    };

    // Rogue Break started - show draft modal
    const handleRogueBreakStarted = (data: {
      breakNumber: number;
      draftTimeSeconds: number;
      deadline: number;
    }) => {
      console.log('🎴 Rogue Break started:', data);
      setIsInRogueBreak(true);
      setHasSelectedDraft(false);
    };

    // Draft options received
    const handleDraftOptions = (data: DraftOptions) => {
      console.log('🎴 Draft options received:', data);
      setDraftOptions(data);
    };

    // Rogue Break ended - close draft modal
    const handleRogueBreakEnded = (data: {
      breakNumber: number;
      draftResults: Array<{ playerId: string; relicId: string | null; relicName?: string }>;
    }) => {
      console.log('🎴 Rogue Break ended:', data);
      setIsInRogueBreak(false);
      setDraftOptions(null);
      setHasSelectedDraft(false);

      // Show notifications for drafted relics
      data.draftResults.forEach((result) => {
        if (result.relicName) {
          addNotification({
            type: 'drafted',
            playerName: result.playerId === myPlayerId ? 'You' : 'Player',
            relicName: result.relicName,
            relicRarity: 'common', // Could be included in the event
            isOwnRelic: result.playerId === myPlayerId,
          });
        }
      });
    };

    // Relic activated
    const handleRelicActivated = (data: {
      playerId: string;
      relicId: string;
      relicName: string;
      effectDescription: string;
      rarity?: RelicRarity;
    }) => {
      console.log('🎴 Relic activated:', data);
      addNotification({
        type: 'activated',
        playerName: data.playerId === myPlayerId ? 'You' : 'Opponent',
        relicName: data.relicName,
        relicRarity: data.rarity || 'common',
        effectDescription: data.effectDescription,
        isOwnRelic: data.playerId === myPlayerId,
      });
    };

    // Relic revealed
    const handleRelicRevealed = (data: {
      playerId: string;
      relicId: string;
      relicName: string;
      rarity: RelicRarity;
      reason?: string;
    }) => {
      console.log('🎴 Relic revealed:', data);
      if (data.playerId !== myPlayerId) {
        addNotification({
          type: 'revealed',
          playerName: 'Opponent',
          relicName: data.relicName,
          relicRarity: data.rarity,
        });
      }
    };

    // Tournament info (includes roguelike state)
    const handleTournamentInfo = (data: {
      state: { roguelikeState?: RoguelikeState };
    }) => {
      if (data.state.roguelikeState) {
        setRoguelikeState(data.state.roguelikeState);

        // Update my relics from state
        const myRelicsFromState = data.state.roguelikeState.playerRelics[myPlayerId];
        if (myRelicsFromState) {
          setMyRelics(myRelicsFromState);
        }
      }
    };

    // Tournament event (updates roguelike state)
    const handleTournamentEvent = (event: {
      type: string;
      data?: any;
    }) => {
      switch (event.type) {
        case 'rogue_break_triggered':
          handleRogueBreakTriggered(event.data);
          break;
        case 'rogue_break_started':
          handleRogueBreakStarted(event.data);
          break;
        case 'rogue_break_ended':
          handleRogueBreakEnded(event.data);
          break;
        case 'relic_activated':
          handleRelicActivated(event.data);
          break;
        case 'relic_revealed':
          handleRelicRevealed(event.data);
          break;
      }
    };

    // Roguelike-specific events
    const handleRoguelikeEvent = (event: { type: string; data?: any }) => {
      console.log('🎴 Roguelike event:', event);
      // Forward to tournament event handler
      handleTournamentEvent(event);
    };

    // Register listeners
    socket.on('rogue_break_draft', handleDraftOptions);
    socket.on('tournament_info', handleTournamentInfo);
    socket.on('tournament_event', handleTournamentEvent);
    socket.on('roguelike_event', handleRoguelikeEvent);
    socket.on('relic_event', handleRelicActivated);

    return () => {
      socket.off('rogue_break_draft', handleDraftOptions);
      socket.off('tournament_info', handleTournamentInfo);
      socket.off('tournament_event', handleTournamentEvent);
      socket.off('roguelike_event', handleRoguelikeEvent);
      socket.off('relic_event', handleRelicActivated);
    };
  }, [socket, myPlayerId, addNotification]);

  // Actions
  const selectRelic = useCallback((relicId: string) => {
    if (!socket || hasSelectedDraft) return;

    socket.emit('select_relic', { relicId });
    setHasSelectedDraft(true);
    console.log('🎴 Selected relic:', relicId);
  }, [socket, hasSelectedDraft]);

  const activateRelic = useCallback((relicId: string) => {
    if (!socket) return;

    socket.emit('activate_relic', { relicId });
    console.log('🎴 Activating relic:', relicId);
  }, [socket]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const hideBreakAnnouncement = useCallback(() => {
    setShowBreakAnnouncement(false);
  }, []);

  const state: RelicEventState = {
    myRelics,
    draftOptions,
    hasSelectedDraft,
    roguelikeState,
    isInRogueBreak,
    notifications,
    showBreakAnnouncement,
    breakAnnouncementNumber,
  };

  const actions: RelicEventActions = {
    selectRelic,
    activateRelic,
    dismissNotification,
    hideBreakAnnouncement,
  };

  return [state, actions];
}
