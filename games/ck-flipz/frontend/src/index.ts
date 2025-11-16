/**
 * @antetown/game-ck-flipz - Frontend
 *
 * CK Flipz client components
 */

// Export the socket-connected wrapper (use this for platform integration)
export { default as CKFlipzClient } from './CKFlipzApp';

// Export the pure component (for testing/development)
export { default as CoinFlipClient } from './CoinFlipClient';

export const GAME_CLIENT_INFO = {
  id: 'ck-flipz',
  name: 'CK Flipz',
  component: 'CKFlipzClient',
  requiresAuth: true,
  fullscreen: true
};
