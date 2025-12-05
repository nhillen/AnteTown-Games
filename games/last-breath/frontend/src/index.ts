/**
 * @antetown/game-last-breath - Frontend
 *
 * Last Breath client component for platform integration
 * Uses SharedRunClient which accepts platform socket (no standalone socket creation)
 */

export { SharedRunClient } from './components/SharedRunClient.js';

export const GAME_CLIENT_INFO = {
  id: 'last-breath',
  name: 'Last Breath',
  version: '0.1.0'
};
