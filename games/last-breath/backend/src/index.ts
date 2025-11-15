/**
 * @antetown/game-last-breath - Backend
 *
 * Last Breath: A deterministic push-your-luck survival game
 * Players descend through rooms managing oxygen, suit integrity, and corruption
 */

import { LastBreathGame } from './LastBreathGame.js';
import { SharedRunManager } from './SharedRunManager.js';
import { lastBreathInitializer } from './initializer-shared.js';
import type { LastBreathConfig, RunState, GameEvent } from './types/index.js';
import type { SharedRunState, PlayerRunState } from './types/SharedRun.js';

export { LastBreathGame, SharedRunManager };
export { lastBreathInitializer };
export type { LastBreathConfig, RunState, GameEvent, SharedRunState, PlayerRunState };

export const GAME_METADATA = {
  id: 'last-breath',
  name: 'Last Breath',
  description: 'Every room takes your breath away. Literally.',
  icon: '💨',
  minPlayers: 1,
  maxPlayers: 1,
  tags: ['Skill', 'Push Your Luck'] as const,
  version: '0.1.0',
  path: '/last-breath'
};
