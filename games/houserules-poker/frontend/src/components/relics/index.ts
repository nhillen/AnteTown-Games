/**
 * Relic Components Module
 *
 * UI components for the Roguelike "House Rules" relic system.
 */

// Types
export type {
  RelicRarity,
  RelicActivationType,
  RelicEffect,
  RelicDefinition,
  PlayerRelic,
  DraftOptions,
  RelicActivationResult,
  RoguelikeState,
} from './types';

export {
  getRarityColors,
  getActivationIcon,
  getRarityLabel,
} from './types';

// Components
export { RelicCard, RelicBadge } from './RelicCard';
export type { RelicCardProps, RelicBadgeProps } from './RelicCard';

export { RelicDraftModal } from './RelicDraftModal';
export type { RelicDraftModalProps } from './RelicDraftModal';

export { PlayerRelicBar, OpponentRelicIndicator } from './PlayerRelicBar';
export type { PlayerRelicBarProps, OpponentRelicIndicatorProps } from './PlayerRelicBar';

export {
  RelicNotification,
  RelicNotificationManager,
  RogueBreakAnnouncement,
} from './RelicNotification';
export type {
  RelicNotificationData,
  RelicNotificationProps,
  RelicNotificationManagerProps,
  RogueBreakAnnouncementProps,
} from './RelicNotification';

// Hooks
export { useRelicEvents } from './useRelicEvents';
export type { RelicEventState, RelicEventActions } from './useRelicEvents';
