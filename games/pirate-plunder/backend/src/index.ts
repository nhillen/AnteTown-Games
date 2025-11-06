/**
 * @pirate/game-pirate-plunder - Backend Exports
 *
 * This file exports the game setup for Pirate Plunder so it can be imported
 * by host platforms (like AnteTown).
 */

import type { Server as SocketIOServer } from 'socket.io'

// Game metadata for platform integration
export const GAME_METADATA = {
  id: 'pirate-plunder',
  name: 'Pirate Plunder',
  description: 'Roll to be Captain or Crew',
  icon: '🎲',
  minPlayers: 2,
  maxPlayers: 8,
  tags: ['Skill', 'Chance'] as const,
  version: '0.1.0',
  path: '/pirate-plunder' // URL path for this game
}

/**
 * Initialize Pirate Plunder game on a Socket.IO server
 * This registers all game event handlers
 */
export function initializePiratePlunder(io: SocketIOServer, options?: {
  namespace?: string
  enableDebugRoutes?: boolean
}) {
  // TODO: Extract game initialization logic from server.ts
  // For now, this is a placeholder that will be implemented
  // when we integrate with AnteTown

  const namespace = options?.namespace || '/'
  console.log(`🏴‍☠️ Initializing Pirate Plunder game on namespace: ${namespace}`)

  // Game logic will be registered here
  // Socket event handlers for: join, sit_down, lock_select, player_action, etc.

  return {
    gameId: GAME_METADATA.id,
    namespace
  }
}

// Export types that platforms might need
export type PiratePlunderPlayer = {
  id: string
  name: string
  bankroll: number
  isAI: boolean
}

export type PiratePlunderGameState = {
  phase: string
  seats: any[]
  pot: number
  currentBet: number
}
