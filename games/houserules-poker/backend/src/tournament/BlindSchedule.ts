/**
 * Blind Schedule Management
 *
 * Handles blind level progression for tournaments.
 * Supports both time-based and hand-based progression.
 */

import type { BlindLevel, BlindScheduleConfig, BlindProgression } from './TournamentConfig.js';

/**
 * Default level duration: 10 minutes
 */
const DEFAULT_LEVEL_DURATION_MS = 10 * 60 * 1000;

/**
 * Default hands per level
 */
const DEFAULT_HANDS_PER_LEVEL = 20;

/**
 * Manages blind schedule for a tournament
 */
export class BlindSchedule {
  private readonly levels: BlindLevel[];
  private readonly progression: BlindProgression;
  private readonly defaultDuration: number;
  private readonly defaultHandsPerLevel: number;

  constructor(config: BlindScheduleConfig) {
    this.levels = config.levels;
    this.progression = config.progression;
    this.defaultDuration = config.levelDuration ?? DEFAULT_LEVEL_DURATION_MS;
    this.defaultHandsPerLevel = config.handsPerLevel ?? DEFAULT_HANDS_PER_LEVEL;
  }

  /**
   * Get the blind level at a specific level number
   */
  getLevel(levelNumber: number): BlindLevel | undefined {
    return this.levels[levelNumber];
  }

  /**
   * Get the current blinds for a level
   */
  getBlinds(levelNumber: number): { smallBlind: number; bigBlind: number; ante: number } {
    const level = this.levels[levelNumber];
    if (!level) {
      // If we've exceeded all levels, return the last level
      const lastLevel = this.levels[this.levels.length - 1];
      if (lastLevel) {
        return {
          smallBlind: lastLevel.smallBlind,
          bigBlind: lastLevel.bigBlind,
          ante: lastLevel.ante ?? 0,
        };
      }
      throw new Error('No blind levels configured');
    }

    return {
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      ante: level.ante ?? 0,
    };
  }

  /**
   * Check if it's time to advance to the next level
   */
  shouldAdvanceLevel(
    currentLevel: number,
    levelStartedAt: number,
    handsThisLevel: number
  ): boolean {
    // Can't advance past the last level
    if (currentLevel >= this.levels.length - 1) {
      return false;
    }

    if (this.progression === 'time') {
      const level = this.levels[currentLevel];
      const duration = level?.duration ?? this.defaultDuration;
      return Date.now() - levelStartedAt >= duration;
    } else {
      return handsThisLevel >= this.defaultHandsPerLevel;
    }
  }

  /**
   * Get the duration for a specific level (time-based only)
   */
  getLevelDuration(levelNumber: number): number {
    const level = this.levels[levelNumber];
    return level?.duration ?? this.defaultDuration;
  }

  /**
   * Get hands per level (hand-based only)
   */
  getHandsPerLevel(): number {
    return this.defaultHandsPerLevel;
  }

  /**
   * Get the progression type
   */
  getProgression(): BlindProgression {
    return this.progression;
  }

  /**
   * Get total number of levels
   */
  getTotalLevels(): number {
    return this.levels.length;
  }

  /**
   * Get time remaining in current level (time-based only)
   */
  getTimeRemaining(currentLevel: number, levelStartedAt: number): number {
    if (this.progression !== 'time') {
      return 0;
    }

    const duration = this.getLevelDuration(currentLevel);
    const elapsed = Date.now() - levelStartedAt;
    return Math.max(0, duration - elapsed);
  }

  /**
   * Get hands remaining in current level (hand-based only)
   */
  getHandsRemaining(handsThisLevel: number): number {
    if (this.progression !== 'hands') {
      return 0;
    }

    return Math.max(0, this.defaultHandsPerLevel - handsThisLevel);
  }

  // ============================================================================
  // Static Factory Methods
  // ============================================================================

  /**
   * Create a standard SNG blind schedule based on starting stack
   * Levels are designed to create action within ~1-2 hours
   */
  static createStandardSNG(startingStack: number, progression: BlindProgression = 'hands'): BlindScheduleConfig {
    // Starting BB is about 1% of starting stack
    const baseBB = Math.max(10, Math.floor(startingStack / 100));
    const baseSB = Math.floor(baseBB / 2);

    const levels: BlindLevel[] = [
      { level: 0, smallBlind: baseSB, bigBlind: baseBB },
      { level: 1, smallBlind: baseBB, bigBlind: baseBB * 2 },
      { level: 2, smallBlind: Math.floor(baseBB * 1.5), bigBlind: baseBB * 3 },
      { level: 3, smallBlind: baseBB * 2, bigBlind: baseBB * 4, ante: Math.floor(baseBB / 2) },
      { level: 4, smallBlind: baseBB * 3, bigBlind: baseBB * 6, ante: baseBB },
      { level: 5, smallBlind: baseBB * 4, bigBlind: baseBB * 8, ante: Math.floor(baseBB * 1.5) },
      { level: 6, smallBlind: baseBB * 5, bigBlind: baseBB * 10, ante: baseBB * 2 },
      { level: 7, smallBlind: baseBB * 6, bigBlind: baseBB * 12, ante: Math.floor(baseBB * 2.5) },
      { level: 8, smallBlind: baseBB * 8, bigBlind: baseBB * 16, ante: baseBB * 3 },
      { level: 9, smallBlind: baseBB * 10, bigBlind: baseBB * 20, ante: baseBB * 4 },
      { level: 10, smallBlind: baseBB * 15, bigBlind: baseBB * 30, ante: baseBB * 5 },
      { level: 11, smallBlind: baseBB * 20, bigBlind: baseBB * 40, ante: baseBB * 6 },
      { level: 12, smallBlind: baseBB * 25, bigBlind: baseBB * 50, ante: baseBB * 8 },
    ];

    return {
      levels,
      progression,
      levelDuration: 5 * 60 * 1000,  // 5 minutes per level (for time-based)
      handsPerLevel: 15,              // 15 hands per level (for hand-based)
    };
  }

  /**
   * Create a turbo SNG schedule (faster blind increases)
   */
  static createTurboSNG(startingStack: number, progression: BlindProgression = 'hands'): BlindScheduleConfig {
    const standard = BlindSchedule.createStandardSNG(startingStack, progression);

    return {
      ...standard,
      levelDuration: 3 * 60 * 1000,  // 3 minutes per level
      handsPerLevel: 8,               // 8 hands per level
    };
  }

  /**
   * Create a hyper-turbo SNG schedule (very fast)
   */
  static createHyperTurboSNG(startingStack: number, progression: BlindProgression = 'hands'): BlindScheduleConfig {
    const standard = BlindSchedule.createStandardSNG(startingStack, progression);

    // Fewer levels, faster increases
    const levels = standard.levels.slice(0, 8);

    return {
      levels,
      progression,
      levelDuration: 2 * 60 * 1000,  // 2 minutes per level
      handsPerLevel: 5,               // 5 hands per level
    };
  }

  /**
   * Create a deep-stack SNG schedule (slower blind increases)
   */
  static createDeepStackSNG(startingStack: number, progression: BlindProgression = 'hands'): BlindScheduleConfig {
    // Start with smaller blinds relative to stack
    const baseBB = Math.max(10, Math.floor(startingStack / 200)); // 0.5% of stack
    const baseSB = Math.floor(baseBB / 2);

    const levels: BlindLevel[] = [
      { level: 0, smallBlind: baseSB, bigBlind: baseBB },
      { level: 1, smallBlind: baseBB, bigBlind: baseBB * 2 },
      { level: 2, smallBlind: Math.floor(baseBB * 1.5), bigBlind: baseBB * 3 },
      { level: 3, smallBlind: baseBB * 2, bigBlind: baseBB * 4 },
      { level: 4, smallBlind: Math.floor(baseBB * 2.5), bigBlind: baseBB * 5 },
      { level: 5, smallBlind: baseBB * 3, bigBlind: baseBB * 6, ante: Math.floor(baseBB / 2) },
      { level: 6, smallBlind: baseBB * 4, bigBlind: baseBB * 8, ante: baseBB },
      { level: 7, smallBlind: baseBB * 5, bigBlind: baseBB * 10, ante: Math.floor(baseBB * 1.5) },
      { level: 8, smallBlind: baseBB * 6, bigBlind: baseBB * 12, ante: baseBB * 2 },
      { level: 9, smallBlind: baseBB * 8, bigBlind: baseBB * 16, ante: Math.floor(baseBB * 2.5) },
      { level: 10, smallBlind: baseBB * 10, bigBlind: baseBB * 20, ante: baseBB * 3 },
      { level: 11, smallBlind: baseBB * 12, bigBlind: baseBB * 24, ante: baseBB * 4 },
      { level: 12, smallBlind: baseBB * 15, bigBlind: baseBB * 30, ante: baseBB * 5 },
      { level: 13, smallBlind: baseBB * 20, bigBlind: baseBB * 40, ante: baseBB * 6 },
      { level: 14, smallBlind: baseBB * 25, bigBlind: baseBB * 50, ante: baseBB * 8 },
      { level: 15, smallBlind: baseBB * 30, bigBlind: baseBB * 60, ante: baseBB * 10 },
    ];

    return {
      levels,
      progression,
      levelDuration: 10 * 60 * 1000, // 10 minutes per level
      handsPerLevel: 25,              // 25 hands per level
    };
  }
}
