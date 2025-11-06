/**
 * @pirate/game-pirate-plunder - Frontend Exports
 *
 * This file exports the client component for Pirate Plunder so it can be imported
 * by host platforms (like AnteTown).
 */

// Export the main game component
export { default as PiratePlunderClient } from './components/GameApp'

// Export additional components that might be useful
export { default as BackOffice } from './components/BackOffice'

// Export game metadata (matches backend)
export const GAME_CLIENT_INFO = {
  id: 'pirate-plunder',
  name: 'Pirate Plunder',
  component: 'PiratePlunderClient',
  requiresAuth: true,
  fullscreen: true
}
