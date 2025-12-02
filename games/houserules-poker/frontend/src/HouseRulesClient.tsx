/**
 * HouseRulesClient
 *
 * Wrapper component that integrates PokerClient with the Roguelike relic system.
 * Use this component instead of PokerClient for House Rules / Roguelike tournaments.
 */

import React from 'react';
import type { Socket } from 'socket.io-client';
import PokerClient, { PokerClientProps } from './PokerClient';
import {
  useRelicEvents,
  RelicDraftModal,
  PlayerRelicBar,
  RelicNotificationManager,
  RogueBreakAnnouncement,
} from './components/relics';
import './components/relics/relics.css';

export interface HouseRulesClientProps extends PokerClientProps {
  /** Socket connection for relic events */
  socket: Socket | null;
  /** Whether this is a roguelike tournament */
  isRoguelike?: boolean;
}

export const HouseRulesClient: React.FC<HouseRulesClientProps> = ({
  socket,
  isRoguelike = false,
  myPlayerId,
  ...pokerProps
}) => {
  // Only use relic events hook if this is a roguelike tournament
  const [relicState, relicActions] = useRelicEvents(
    isRoguelike ? socket : null,
    myPlayerId
  );

  return (
    <div className="relative">
      {/* Base poker client */}
      <PokerClient
        myPlayerId={myPlayerId}
        {...pokerProps}
      />

      {/* Roguelike UI overlay */}
      {isRoguelike && (
        <>
          {/* Rogue Break Announcement */}
          <RogueBreakAnnouncement
            breakNumber={relicState.breakAnnouncementNumber}
            isVisible={relicState.showBreakAnnouncement}
            onComplete={relicActions.hideBreakAnnouncement}
          />

          {/* Draft Modal */}
          <RelicDraftModal
            isOpen={relicState.isInRogueBreak && !!relicState.draftOptions}
            draftOptions={relicState.draftOptions}
            onSelect={relicActions.selectRelic}
            hasSelected={relicState.hasSelectedDraft}
          />

          {/* Player's Relics Bar */}
          {relicState.myRelics.length > 0 && (
            <PlayerRelicBar
              relics={relicState.myRelics}
              roguelikeState={relicState.roguelikeState ?? undefined}
              onActivateRelic={relicActions.activateRelic}
              position="bottom"
            />
          )}

          {/* Notifications */}
          <RelicNotificationManager
            notifications={relicState.notifications}
            onDismiss={relicActions.dismissNotification}
          />
        </>
      )}
    </div>
  );
};

export default HouseRulesClient;
