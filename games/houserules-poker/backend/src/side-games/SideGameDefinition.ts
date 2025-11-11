import { Card, HandEvaluation, SideGamePayout } from '../types.js';
import { Seat } from '@antetown/game-sdk';
import { PokerSeat } from '../types.js';

/**
 * Context passed to side game hooks
 */
export interface SideGameContext {
  winner: Seat & PokerSeat;
  winningHand?: HandEvaluation;
  sideGame: any;  // ActiveSideGame
  participants: any[];  // SideGameParticipant[]
  allSeats: (Seat & PokerSeat)[];
  gameState: any;
}

/**
 * Definition of a side game type
 */
export interface SideGameDefinition {
  type: string;
  displayName: string;
  description: string;
  isOptional: boolean;          // Can players opt out?
  requiresUpfrontBuyIn: boolean;  // Or per-hand contribution?

  // Defaults
  defaultBuyIn?: number;
  defaultContributionPerHand?: number;
  defaultConfig?: any;

  // Validation
  minParticipants?: number;
  maxParticipants?: number;

  // Hooks
  onHandComplete?: (context: SideGameContext) => SideGamePayout[];
  onRoundEnd?: (context: SideGameContext) => SideGamePayout[];

  // Configuration validation
  validateConfig?: (config: any) => { valid: boolean; error?: string };
}

/**
 * Registry of all available side game types
 */
export class SideGameRegistry {
  private static definitions = new Map<string, SideGameDefinition>();

  static register(definition: SideGameDefinition): void {
    this.definitions.set(definition.type, definition);
  }

  static get(type: string): SideGameDefinition | undefined {
    return this.definitions.get(type);
  }

  static getAll(): SideGameDefinition[] {
    return Array.from(this.definitions.values());
  }

  static getOptional(): SideGameDefinition[] {
    return this.getAll().filter(d => d.isOptional);
  }
}
