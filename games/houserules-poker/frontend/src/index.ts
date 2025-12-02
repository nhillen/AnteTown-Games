/**
 * @antetown/game-houserules-frontend
 *
 * Multi-table Poker game frontend components
 */

// Export frontend React components
export { default as PokerClient } from './PokerClient.js';
export { default as HouseRulesClient } from './HouseRulesClient.js';
export type { HouseRulesClientProps } from './HouseRulesClient.js';
export { PokerLobby } from './PokerLobby.js';
export { PokerLobbyList } from './PokerLobbyList.js';
export { GameCreator } from './GameCreator.js';
export { TablePreview } from './TablePreview.js';
export type { GameCreatorConfig } from './GameCreator.js';

// Export prop bet components
export { PropBetProposalModal } from './components/PropBetProposalModal.js';
export type { PropBetProposalModalProps } from './components/PropBetProposalModal.js';
export { PropBetSelectionMenu } from './components/PropBetSelectionMenu.js';
export type { PropBetSelectionMenuProps } from './components/PropBetSelectionMenu.js';
export { PropBetNotification } from './components/PropBetNotification.js';
export type { PropBetNotificationProps } from './components/PropBetNotification.js';

// Export relic components for roguelike mode
export {
  RelicCard,
  RelicBadge,
  RelicDraftModal,
  PlayerRelicBar,
  OpponentRelicIndicator,
  RelicNotification,
  RelicNotificationManager,
  RogueBreakAnnouncement,
  useRelicEvents,
  getRarityColors,
  getActivationIcon,
  getRarityLabel,
} from './components/relics/index.js';

export type {
  RelicRarity,
  RelicActivationType,
  RelicEffect,
  RelicDefinition,
  PlayerRelic,
  DraftOptions,
  RoguelikeState,
  RelicCardProps,
  RelicBadgeProps,
  RelicDraftModalProps,
  PlayerRelicBarProps,
  OpponentRelicIndicatorProps,
  RelicNotificationData,
  RelicNotificationProps,
  RelicNotificationManagerProps,
  RogueBreakAnnouncementProps,
  RelicEventState,
  RelicEventActions,
} from './components/relics/index.js';
