// CRITICAL: Load environment variables FIRST before any other imports
// This ensures OAuth credentials are available when passport.ts is imported
import * as dotenv from 'dotenv';
import * as path from 'path';

// Always load .env file - in production it's in the backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Pool } from 'pg';
import { Server as SocketIOServer } from 'socket.io';
import { GameDebugger } from './debug-middleware';
import { defaultCargoChestConfig, CargoChestConfig, PlayerStamps, analyzeLowDice, calculateChestAward, LowDiceResult, ChestTriggerCandidate, resolveChestTriggerTiebreaker } from './cargo-chest-config';
import { ChestConfig } from './types/table-config';
import { logger, BankrollUtils } from '@pirate/core-engine';
import { connectDB, prisma } from './config/database';
import passport from './config/passport';
import authRoutes from './routes/auth';
import healthRoutes from './routes/health';
import diceCollectionsRoutes from './routes/diceCollections';
import { UserProfile } from './models/User';
import { configService } from './services/config-service';
import { TableConfig as TableConfigType } from './types/table-config';
import { moneyFlowService, TransactionType, AccountType } from '@pirate/core-engine';
import { crossReferenceService } from './services/cross-reference-service';
import * as fs from 'fs';
// import { gameRegistry, GameType } from '@pirate/game-sdk';
// import { CoinFlipGame, CardFlipGame, FLIPZ_TABLES, FlipzTableConfig } from '@pirate/game-coin-flip';
// import { WarFaireGame } from '@pirate/game-warfaire';
// import { HouseRules, TableManager, TableRegistry } from '@pirate/game-houserules';
// TODO: Re-enable other games when integrating with multi-game platform
type GameType = string; // Temporary placeholder

// DEBUG: Log OAuth environment variables
console.log('🔍 OAuth Environment Check:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID?.slice(0, 20)}...`);
console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL}`);

// Connect to database
connectDB();

// Create PostgreSQL session store
const PostgreSQLStore = pgSession(session);
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

type PlayerCosmetics = {
  banner?: string;
  emblem?: string;
  title?: string;
  highSkin?: string;  // Dice skin for high-value rolls (4-6)
  lowSkin?: string;   // Dice skin for low-value rolls (1-3)
};

type Player = {
  id: string;
  name: string;
  isAI: boolean;
  bankroll: number;
  tableStack?: number; // Money available at table when seated
  googleId?: string; // For database persistence
  cosmetics?: PlayerCosmetics;
  aiProfile?: AIProfile;
};

type LobbyState = {
  players: Player[];
};

type TableConfig = {
  minHumanPlayers: number;  // Minimum humans required to start
  targetTotalPlayers: number; // Target total players (will auto-fill with AI)
  maxSeats: number;          // Maximum seats at table
  cargoChestLearningMode: boolean; // If true, disables fresh table fallback (requires stamps)
};

type TableState = {
  seats: (Player | null)[];  // Array of seats, null = empty
  config: TableConfig;
  cargoChest?: number;       // Persistent cargo chest value across games
};

type GamePhase =
  | 'Lobby'
  | 'PreHand'
  | 'Ante'
  | 'Roll1'
  | 'Lock1'
  | 'Bet1'
  | 'Roll2'
  | 'Lock2'
  | 'Bet2'
  | 'Roll3'
  | 'Lock3'
  | 'Roll4'
  | 'Bet3'
  | 'Showdown'
  | 'Payout'
  | 'HandEnd';

type Die = { value: number; locked: boolean; isPublic?: boolean }; // isPublic indicates if this die is visible to other players

type AIProfile = {
  name: string;
  style: string;
  riskTolerance: number;
  bluffFrequency: number;
  foldThreshold: number;
  raiseMultiplier: number;
  rolePriority: string[];
  mistakeChance: number;
};
type Seat = {
  playerId: string;
  name: string;
  isAI: boolean;
  tableStack: number; // Player's funds available at this table
  dice: Die[];
  hasFolded: boolean;
  lockAllowance: number; // locks remaining for current lock phase
  minLocksRequired?: number; // minimum locks required for current round
  lockingDone: boolean; // player has confirmed their dice locks
  currentBet: number; // amount this player has bet in current betting round
  hasActed: boolean; // whether player has taken action in current betting round
  aiProfile?: AIProfile | undefined; // AI personality profile for decision making
  isAllIn?: boolean; // whether player is all-in
  totalContribution?: number; // total amount contributed to pot this hand
  cosmetics?: PlayerCosmetics; // player's selected cosmetic options
  standingUp?: boolean; // player will stand up after current hand ends
};

type HandResult = {
  sixCount: number; // Count of 6s for Ship role
  fiveCount: number; // Count of 5s for Captain role
  fourCount: number; // Count of 4s for Crew role
  oneCount: number; // Count of 1s for cargo
  twoCount: number; // Count of 2s for cargo  
  threeCount: number; // Count of 3s for cargo
}

type ShowdownResult = {
  playerId: string;
  name: string;
  handResult: HandResult;
  roles: string[]; // Array of role names this player won
  payout: number;
  isActive: boolean; // Whether player participated in showdown
}

type SidePot = {
  amount: number;
  eligiblePlayers: string[]; // playerIds who can win this pot
};

type GameState = {
  phase: GamePhase;
  seats: Seat[];
  pot: number;
  currentBet: number;
  ante: number;
  countdownEndsAtMs?: number;
  currentTurnPlayerId?: string;
  turnEndsAtMs?: number;
  phaseEndsAtMs?: number;
  dealerSeatIndex?: number;
  bettingRoundComplete?: boolean;
  bettingRoundCount?: number; // Track number of raises this round
  showdownResults?: ShowdownResult[];
  carryoverPot?: number; // Pot carried over from previous hands
  allLockingComplete?: boolean; // Whether all players have finished locking in current round
  handCount?: number; // Track number of hands played for ante 'every_nth' mode
  roleAssignments?: {
    ship?: string | undefined; // playerId of ship winner
    captain?: string | undefined; // playerId of captain winner  
    crew?: string | undefined; // playerId of crew winner
    cargoEffect?: string; // '1s' | '2s' | '3s' | 'tie'
  };
  sidePots?: SidePot[]; // Side pots for all-in situations
  davyJonesRake?: number; // The "Davy Jones' Rake" collected this hand
  displayRake?: number; // Cumulative rake shown to players (for UI display)
  totalDavyJonesRake?: number; // Running total of all rake collected
  cargoChest?: number; // Progressive cargo chest (per table)
  dripAccumulator?: number; // Sub-penny accumulator for precise math
  chestAwards?: { playerId: string; type: string; amount: number }[]; // Chest awards this hand
  roleTies?: {
    ship: { playerId: string; name: string; count: number }[] | null;
    captain: { playerId: string; name: string; count: number }[] | null;
    crew: { playerId: string; name: string; count: number }[] | null;
  };
};

// Global configuration for cargo chest system
const cargoConfig = defaultCargoChestConfig;

// Per-table stamps tracking
const playerStamps = new Map<string, PlayerStamps>(); // key: playerId + tableId

// Helper functions for cargo chest system
function initializeCargoChest(gameState: GameState) {
  if (gameState.cargoChest === undefined) {
    // Use table's persistent cargo chest value if available
    gameState.cargoChest = tableState.cargoChest || 0;
  }
  if (gameState.dripAccumulator === undefined) {
    gameState.dripAccumulator = 0;
  }
}

function processDripFromWager(gameState: GameState, wagerAmount: number): { mainPot: number; chestDrip: number } {
  initializeCargoChest(gameState);
  
  const tableConfig = configService.getConfig();
  const exactDrip = wagerAmount * tableConfig.chest.drip_percent;
  const accumulatedDrip = (gameState.dripAccumulator || 0) + exactDrip;
  
  const integerDrip = Math.floor(accumulatedDrip);
  gameState.dripAccumulator = accumulatedDrip - integerDrip;
  
  const mainPotAmount = wagerAmount - integerDrip;
  gameState.cargoChest = (gameState.cargoChest || 0) + integerDrip;
  
  // Update display rake for UI (cumulative, no cap applied)
  const displayRakeIncrease = calculateDisplayRake(wagerAmount);
  gameState.displayRake = (gameState.displayRake || 0) + displayRakeIncrease;
  
  if (integerDrip > 0) {
    gameDebugger.logEvent('cargo_drip', 'system', {
      wager: wagerAmount,
      drip: integerDrip,
      newChestTotal: gameState.cargoChest
    });

    // Log the chest drip to money flow service
    logMoneyFlow(
      'CHEST_DRIP',
      'system',
      'System',
      'MAIN_POT',
      'CARGO_CHEST',
      integerDrip,
      `${integerDrip} pennies dripped to cargo chest from ${wagerAmount} pennies wager`,
      {
        wagerAmount,
        dripPercent: tableConfig.chest.drip_percent,
        exactDrip,
        accumulatedDrip,
        chestBefore: (gameState.cargoChest || 0) - integerDrip,
        chestAfter: gameState.cargoChest,
        handId: currentHandHistory?.handId,
        phase: gameState.phase
      }
    );
  }
  
  return { mainPot: mainPotAmount, chestDrip: integerDrip };
}

function getPlayerStamps(playerId: string, tableId = 'default'): PlayerStamps {
  const key = `${playerId}_${tableId}`;
  if (!playerStamps.has(key)) {
    playerStamps.set(key, {
      playerId,
      tableId,
      stamps: new Array(cargoConfig.stamps.window_hands).fill(false),
      currentCount: 0
    });
  }
  return playerStamps.get(key)!;
}

function awardStamp(playerId: string, tableId = 'default') {
  const stamps = getPlayerStamps(playerId, tableId);
  stamps.stamps.shift(); // Remove oldest
  stamps.stamps.push(true); // Add current hand
  stamps.currentCount = stamps.stamps.filter(s => s).length;
}

// Configure CORS
const corsOrigins = process.env.CORS_ORIGINS || '*';
const corsOptions = {
  origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map(o => o.trim()),
  credentials: true
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'pirate-plunder-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true, // Enable to create sessions for OAuth
  store: new PostgreSQLStore({
    pool: pgPool,
    tableName: 'sessions',
    createTableIfMissing: true
  }),
  cookie: {
    secure: false, // Set to false for HTTP in development/testing
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days - stay logged in for a week!
  }
});

app.use(sessionMiddleware);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Health check routes (for deployment verification)
app.use('/health', healthRoutes);

// Dice collections API routes
app.use('/api/dice-collections', diceCollectionsRoutes);

// Enhanced money flow logging
function logMoneyFlow(
  type: TransactionType,
  playerId: string,
  playerName: string,
  fromAccount: AccountType,
  toAccount: AccountType,
  amount: number,
  description: string,
  details?: any
) {
  moneyFlowService.logTransaction(
    type,
    playerId,
    playerName,
    fromAccount,
    toAccount,
    amount,
    description,
    details,
    gameState?.phase
  );
}

// Legacy bankroll operation logging (enhanced to also use money flow service)
function logBankrollOperation(operation: string, message: string, details?: any) {
  // Use existing logging service for debugging
  logger.logBankrollOperation(
    details?.playerId || 'system',
    `${operation}: ${message}`,
    details?.amount || 0,
    details
  );

  // Also log to money flow service if we have enough information
  if (details?.playerId && details?.playerName && details?.amount) {
    const type = mapOperationToTransactionType(operation);
    const { fromAccount, toAccount } = inferAccountsFromOperation(operation, details);

    if (type && fromAccount && toAccount) {
      logMoneyFlow(
        type,
        details.playerId,
        details.playerName,
        fromAccount,
        toAccount,
        details.amount,
        message,
        details
      );
    }
  }
}

// Helper functions to map legacy operations to new transaction types
function mapOperationToTransactionType(operation: string): TransactionType | null {
  const operationMap: Record<string, TransactionType> = {
    'TABLE_RESET_REFUND': 'TABLE_RESET_REFUND',
    'STANDUP_SUCCESS': 'STANDUP_RETURN',
    'SIT_DOWN_SUCCESS': 'BUY_IN',
    'SEAT_SUCCESS': 'BUY_IN',
    'ANTE_PAYMENT': 'ANTE',
    'BET_ACTION': 'BET',
    'CALL_ACTION': 'CALL',
    'RAISE_ACTION': 'RAISE',
    'PAYOUT_ROLE': 'PAYOUT_ROLE',
    'PAYOUT_CHEST': 'PAYOUT_CHEST',
    'BUST_FEE': 'BUST_FEE'
  };
  return operationMap[operation] || null;
}

function inferAccountsFromOperation(operation: string, details: any): { fromAccount: AccountType | null; toAccount: AccountType | null } {
  switch (operation) {
    case 'TABLE_RESET_REFUND':
    case 'STANDUP_SUCCESS':
      return { fromAccount: 'TABLE_STACK', toAccount: 'PLAYER_BANKROLL' };
    case 'SIT_DOWN_SUCCESS':
    case 'SEAT_SUCCESS':
      return { fromAccount: 'PLAYER_BANKROLL', toAccount: 'TABLE_STACK' };
    case 'ANTE_PAYMENT':
    case 'BET_ACTION':
    case 'CALL_ACTION':
    case 'RAISE_ACTION':
      return { fromAccount: 'TABLE_STACK', toAccount: 'MAIN_POT' };
    case 'PAYOUT_ROLE':
    case 'PAYOUT_CHEST':
      return { fromAccount: 'MAIN_POT', toAccount: 'TABLE_STACK' };
    case 'BUST_FEE':
      return { fromAccount: 'TABLE_STACK', toAccount: 'HOUSE_RAKE' };
    default:
      return { fromAccount: null, toAccount: null };
  }
}

// Database persistence for bankroll changes
async function updateUserBankroll(googleId: string, newBankrollDollars: number): Promise<void> {
  try {
    await pgPool.query(
      'UPDATE users SET bankroll = $1 WHERE "googleId" = $2',
      [newBankrollDollars, googleId]
    );
    console.log(`💾 Updated database bankroll for user ${googleId} to $${newBankrollDollars}`);
    
    // Audit system money after database update
    setTimeout(() => auditSystemMoney(), 100);
  } catch (error) {
    console.error('Failed to update user bankroll:', error);
  }
}

// Database persistence for table bankrolls (crash recovery)
async function saveTableBankroll(player: Player, seatIndex: number, amount: number) {
  if (!player.googleId) {
    console.log(`Cannot save table bankroll for ${player.name}: no googleId`);
    return;
  }
  
  try {
    await prisma.tableBankroll.upsert({
      where: {
        userId_tableId: {
          userId: player.googleId,
          tableId: 'main'
        }
      },
      update: {
        userName: player.name,
        seatIndex: seatIndex,
        amount: amount / 100, // Convert pennies to dollars
        updatedAt: new Date()
      },
      create: {
        userId: player.googleId,
        userName: player.name,
        tableId: 'main',
        seatIndex: seatIndex,
        amount: amount / 100 // Convert pennies to dollars
      }
    });
    console.log(`💾 Saved table bankroll for ${player.name}: $${amount / 100} at seat ${seatIndex}`);
  } catch (error) {
    console.error(`Failed to save table bankroll for ${player.name}:`, error);
  }
}

async function removeTableBankroll(player: Player) {
  if (!player.googleId) {
    console.log(`Cannot remove table bankroll for ${player.name}: no googleId`);
    return;
  }
  
  try {
    await prisma.tableBankroll.delete({
      where: {
        userId_tableId: {
          userId: player.googleId,
          tableId: 'main'
        }
      }
    });
    console.log(`💾 Removed table bankroll record for ${player.name}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      // Record not found - that's okay
      console.log(`Table bankroll record for ${player.name} was already removed`);
    } else {
      console.error(`Failed to remove table bankroll for ${player.name}:`, error);
    }
  }
}

async function recoverTableBankrolls(): Promise<void> {
  console.log('🔍 Checking for table bankrolls to recover...');
  
  try {
    const tableBankrolls = await prisma.tableBankroll.findMany({
      where: { tableId: 'main' }
    });
    
    if (tableBankrolls.length === 0) {
      console.log('✅ No table bankrolls to recover');
      return;
    }
    
    console.log(`🔄 Found ${tableBankrolls.length} table bankrolls to recover:`);
    
    for (const record of tableBankrolls) {
      try {
        // Find the user in database
        const user = await prisma.user.findUnique({
          where: { googleId: record.userId }
        });
        
        if (!user) {
          console.log(`❌ User not found for googleId ${record.userId}, cleaning up record`);
          await prisma.tableBankroll.delete({ where: { id: record.id } });
          continue;
        }
        
        // Add the table bankroll back to the user's main bankroll
        const recoveredAmount = record.amount;
        await prisma.user.update({
          where: { googleId: record.userId },
          data: {
            bankroll: { increment: recoveredAmount },
            lastLogin: new Date()
          }
        });
        
        // Remove the table bankroll record
        await prisma.tableBankroll.delete({ where: { id: record.id } });
        
        console.log(`💰 Recovered $${recoveredAmount} for ${record.userName} (${record.userId})`);
        
      } catch (error) {
        console.error(`Failed to recover bankroll for ${record.userName}:`, error);
      }
    }
    
    console.log('✅ Table bankroll recovery completed');
    
  } catch (error) {
    console.error('Failed to recover table bankrolls:', error);
  }
}

// Read commit hash from build file if available
function getCommitHash(): string {
  try {
    const fs = require('fs');
    const path = require('path');
    const envBuildPath = path.join(__dirname, '.env.build');
    if (fs.existsSync(envBuildPath)) {
      const content = fs.readFileSync(envBuildPath, 'utf8');
      const match = content.match(/COMMIT_HASH=(.+)/);
      if (match) return match[1].trim();
    }
  } catch (e) {
    const error = e as Error;
    console.warn('Could not read build commit hash:', error.message);
  }
  return process.env.COMMIT_HASH || 'unknown';
}

function getBuildInfo(): { commitHash: string, buildDate?: string, buildVersion?: string } {
  try {
    const fs = require('fs');
    const path = require('path');
    const envBuildPath = path.join(__dirname, '.env.build');
    if (fs.existsSync(envBuildPath)) {
      const content = fs.readFileSync(envBuildPath, 'utf8');
      const info: any = {};
      
      const commitMatch = content.match(/COMMIT_HASH=(.+)/);
      if (commitMatch) info.commitHash = commitMatch[1].trim();
      
      const dateMatch = content.match(/BUILD_DATE=(.+)/);
      if (dateMatch) info.buildDate = dateMatch[1].trim();
      
      const versionMatch = content.match(/BUILD_VERSION=(.+)/);
      if (versionMatch) info.buildVersion = versionMatch[1].trim();
      
      return {
        commitHash: info.commitHash || 'unknown',
        ...(info.buildDate && { buildDate: info.buildDate }),
        ...(info.buildVersion && { buildVersion: info.buildVersion })
      };
    }
  } catch (e) {
    const error = e as Error;
    console.warn('Could not read build info:', error.message);
  }
  const result: { commitHash: string, buildDate?: string, buildVersion?: string } = {
    commitHash: process.env.COMMIT_HASH || process.env.GITHUB_SHA?.substring(0, 7) || 'unknown'
  };
  if (process.env.BUILD_DATE) result.buildDate = process.env.BUILD_DATE;
  if (process.env.BUILD_VERSION) result.buildVersion = process.env.BUILD_VERSION;
  return result;
}

// Deployment info endpoint
app.get('/api/deploy-info', (req, res) => {
  const buildInfo = getBuildInfo();
  const deployInfo = {
    timestamp: new Date().toISOString(),
    commitHash: buildInfo.commitHash,
    buildDate: buildInfo.buildDate,
    buildVersion: buildInfo.buildVersion,
    backendVersion: require('../package.json').version,
    nodeEnv: process.env.NODE_ENV,
    uptime: process.uptime(),
    // Add memory usage for debugging
    memory: process.memoryUsage(),
    debugLoggingEnabled: true,
    deployedAt: '2025-09-10T23:33:00Z'
  };
  res.json(deployInfo);
});

// Table requirements endpoint
app.get('/api/table-requirements', (req, res) => {
  try {
    const minimumTableStack = calculateMinimumTableStack();
    const requiredTableStack = calculateRequiredTableStack();
    const config = configService.getConfig();

    res.json({
      minimumTableStack: minimumTableStack / 100, // Convert to dollars for frontend
      requiredTableStack: requiredTableStack / 100, // Convert to dollars for frontend
      tableMinimumMultiplier: config.table.tableMinimumMultiplier,
      breakdown: {
        anteEnabled: config.betting.ante.mode !== 'none',
        anteAmount: config.betting.ante.amount,
        anteProgressive: config.betting.ante.progressive,
        anteStreetMultiplier: config.betting.ante.street_multiplier,
        streetsEnabled: config.betting.streets.enabled,
        s1: config.betting.streets.S1,
        s2: config.betting.streets.S2,
        s3: config.betting.streets.S3,
        bustFeeEnabled: config.bust_fee.enabled,
        bustFeeBasis: config.bust_fee.basis,
        edgeTiersEnabled: config.betting.edge_tiers.enabled,
        edgeTiers: config.betting.edge_tiers,
        dominantThreshold: config.betting.dominant_threshold,
        rulesDisplay: config.rules_display,
        cargoChestLearningMode: config.table.cargoChestLearningMode
      }
    });
  } catch (error) {
    console.error('Error calculating table requirements:', error);
    res.status(500).json({ error: 'Failed to calculate table requirements' });
  }
});

// Hand history endpoints
app.get('/api/hand-history', (_req: Request, res: Response) => {
  try {
    // Return the last 20 hands by default
    const recentHistory = handHistory.slice(-getHistoryLimit('recent_display')).reverse();
    res.json(recentHistory);
  } catch (error) {
    logger.log('error', 'api', 'Failed to get hand history', { error });
    res.status(500).json({ error: 'Failed to get hand history' });
  }
});

app.get('/api/hand-history/:handId', (req: Request, res: Response) => {
  try {
    const handId = req.params.handId;
    const hand = handHistory.find(h => h.handId === handId);
    
    if (!hand) {
      // Try to load from file
      const fs = require('fs');
      const path = require('path');
      const filename = path.join(__dirname, '..', 'hand_history', `${handId}.json`);
      
      if (fs.existsSync(filename)) {
        const handData = JSON.parse(fs.readFileSync(filename, 'utf8'));
        res.json(handData);
      } else {
        res.status(404).json({ error: 'Hand not found' });
      }
    } else {
      res.json(hand);
    }
  } catch (error) {
    logger.log('error', 'api', 'Failed to get hand details', { error });
    res.status(500).json({ error: 'Failed to get hand details' });
  }
});

// Money flow API endpoints
app.get('/api/money-flow/transactions', (req: Request, res: Response) => {
  try {
    const filters: {
      handId?: string;
      playerId?: string;
      type?: TransactionType[];
      limit?: number;
      since?: string;
    } = {};

    if (req.query.handId) filters.handId = req.query.handId as string;
    if (req.query.playerId) filters.playerId = req.query.playerId as string;
    if (req.query.type) filters.type = (req.query.type as string).split(',') as any;
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
    if (req.query.since) filters.since = req.query.since as string;

    const transactions = moneyFlowService.getTransactions(filters);
    res.json({
      transactions,
      total: transactions.length,
      filters
    });
  } catch (error) {
    logger.log('error', 'api', 'Failed to get money flow transactions', { error });
    res.status(500).json({ error: 'Failed to get money flow transactions' });
  }
});

app.get('/api/money-flow/hand-summary/:handId', (req: Request, res: Response) => {
  try {
    const handId = req.params.handId;
    if (!handId) {
      return res.status(400).json({ error: 'Hand ID is required' });
    }
    const summary = moneyFlowService.getHandSummary(handId);
    res.json(summary);
  } catch (error) {
    logger.log('error', 'api', 'Failed to get money flow hand summary', { error });
    res.status(500).json({ error: 'Failed to get money flow hand summary' });
  }
});

app.get('/api/money-flow/audit', (_req: Request, res: Response) => {
  try {
    const audit = moneyFlowService.getMoneyAudit();
    res.json(audit);
  } catch (error) {
    logger.log('error', 'api', 'Failed to get money flow audit', { error });
    res.status(500).json({ error: 'Failed to get money flow audit' });
  }
});

app.post('/api/money-flow/export', (_req: Request, res: Response) => {
  try {
    const exportData = moneyFlowService.exportTransactions();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="money-flow-transactions.json"');
    res.send(exportData);
  } catch (error) {
    logger.log('error', 'api', 'Failed to export money flow transactions', { error });
    res.status(500).json({ error: 'Failed to export money flow transactions' });
  }
});

app.get('/api/money-flow/recent-hands', (_req: Request, res: Response) => {
  try {
    const audit = moneyFlowService.getMoneyAudit();
    const recentHandSummaries = audit.recentHands.map(handId => {
      const summary = moneyFlowService.getHandSummary(handId);
      return {
        handId,
        totalIn: summary.totalIn,
        totalOut: summary.totalOut,
        playerCount: Object.keys(summary.playerBalanceChanges).filter(p => p !== 'system').length,
        timestamp: summary.potBuildup[0]?.timestamp || summary.payouts[0]?.timestamp || new Date().toISOString()
      };
    });
    res.json({
      recentHands: recentHandSummaries,
      totalHands: audit.recentHands.length
    });
  } catch (error) {
    logger.log('error', 'api', 'Failed to get recent hands', { error });
    res.status(500).json({ error: 'Failed to get recent hands' });
  }
});

// HTML-formatted money flow endpoints for easy browser viewing
app.get('/api/money-flow/hand-summary/:handId/html', (req: Request, res: Response) => {
  try {
    const handId = req.params.handId;
    if (!handId) {
      return res.status(400).send('<h1>Error: Hand ID is required</h1>');
    }

    const summary = moneyFlowService.getHandSummary(handId);
    const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Money Flow - Hand ${handId}</title>
      <style>
        body { font-family: monospace; margin: 20px; background: #1a1a1a; color: #fff; }
        h1, h2 { color: #4CAF50; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #444; padding: 8px; text-align: left; }
        th { background-color: #333; }
        .money-in { color: #4CAF50; }
        .money-out { color: #f44336; }
        .timestamp { color: #888; font-size: 0.8em; }
        .player-section { margin: 20px 0; padding: 15px; border: 1px solid #444; border-radius: 5px; }
        .summary-box { background: #2d2d2d; padding: 15px; margin: 10px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>💰 Money Flow Analysis - Hand ${handId}</h1>

      <div class="summary-box">
        <h2>📊 Hand Summary</h2>
        <p><strong>Total Money In:</strong> <span class="money-in">${formatCents(summary.totalIn)}</span></p>
        <p><strong>Total Money Out:</strong> <span class="money-out">${formatCents(summary.totalOut)}</span></p>
        <p><strong>Net Difference:</strong> ${formatCents(summary.totalIn - summary.totalOut)}</p>
      </div>

      <div class="summary-box">
        <h2>🎯 Pot Flow Breakdown</h2>
        <p><strong>Antes:</strong> ${formatCents(summary.potFlow.antes)}</p>
        <p><strong>Bets:</strong> ${formatCents(summary.potFlow.bets)}</p>
        <p><strong>Total Collected:</strong> ${formatCents(summary.potFlow.totalCollected)}</p>
        <p><strong>Payouts:</strong> ${formatCents(summary.potFlow.payouts)}</p>
        <p><strong>Rake:</strong> ${formatCents(summary.potFlow.rake)}</p>
        <p><strong>Chest Drip:</strong> ${formatCents(summary.potFlow.chestDrip)}</p>
        <p><strong>Carryover:</strong> ${formatCents(summary.potFlow.carryover)}</p>
      </div>

      <h2>👥 Player Balance Changes</h2>`;

    Object.entries(summary.playerBalanceChanges).forEach(([playerId, player]) => {
      const netChangeColor = player.netChange >= 0 ? 'money-in' : 'money-out';
      html += `
      <div class="player-section">
        <h3>${player.playerName} (${playerId})</h3>
        <p><strong>Net Change:</strong> <span class="${netChangeColor}">${formatCents(player.netChange)}</span></p>
        ${player.startingBalance !== undefined ? `<p><strong>Starting Balance:</strong> ${formatCents(player.startingBalance)}</p>` : ''}
        ${player.endingBalance !== undefined ? `<p><strong>Ending Balance:</strong> ${formatCents(player.endingBalance)}</p>` : ''}

        <h4>Transactions:</h4>
        <table>
          <tr><th>Time</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Description</th></tr>`;

      player.transactions.forEach(t => {
        const amountColor = t.fromAccount.includes('BANKROLL') ? 'money-out' : 'money-in';
        html += `
          <tr>
            <td class="timestamp">${new Date(t.timestamp).toLocaleTimeString()}</td>
            <td>${t.type}</td>
            <td>${t.fromAccount}</td>
            <td>${t.toAccount}</td>
            <td class="${amountColor}">${formatCents(t.amount)}</td>
            <td>${t.description}</td>
          </tr>`;
      });

      html += `</table></div>`;
    });

    html += `
      <h2>🏗️ Pot Building Transactions</h2>
      <table>
        <tr><th>Time</th><th>Player</th><th>Type</th><th>Amount</th><th>Description</th></tr>`;

    summary.potBuildup.forEach(t => {
      html += `
        <tr>
          <td class="timestamp">${new Date(t.timestamp).toLocaleTimeString()}</td>
          <td>${t.playerName}</td>
          <td>${t.type}</td>
          <td class="money-out">${formatCents(t.amount)}</td>
          <td>${t.description}</td>
        </tr>`;
    });

    html += `</table>

      <h2>💸 Payout Transactions</h2>
      <table>
        <tr><th>Time</th><th>Player</th><th>Type</th><th>Amount</th><th>Description</th></tr>`;

    summary.payouts.forEach(t => {
      html += `
        <tr>
          <td class="timestamp">${new Date(t.timestamp).toLocaleTimeString()}</td>
          <td>${t.playerName}</td>
          <td>${t.type}</td>
          <td class="money-in">${formatCents(t.amount)}</td>
          <td>${t.description}</td>
        </tr>`;
    });

    html += `</table></body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.log('error', 'api', 'Failed to get HTML money flow hand summary', { error });
    res.status(500).send(`<h1>Error</h1><p>Failed to get money flow hand summary: ${error}</p>`);
  }
});

app.get('/api/money-flow/transactions/html', (req: Request, res: Response) => {
  try {
    const filters: {
      handId?: string;
      playerId?: string;
      type?: TransactionType[];
      limit?: number;
      since?: string;
    } = {};

    if (req.query.handId) filters.handId = req.query.handId as string;
    if (req.query.playerId) filters.playerId = req.query.playerId as string;
    if (req.query.type) filters.type = (req.query.type as string).split(',') as any;
    if (req.query.limit) filters.limit = parseInt(req.query.limit as string) || 100;
    if (req.query.since) filters.since = req.query.since as string;

    const transactions = moneyFlowService.getTransactions(filters);
    const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Money Flow Transactions</title>
      <style>
        body { font-family: monospace; margin: 20px; background: #1a1a1a; color: #fff; }
        h1, h2 { color: #4CAF50; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #444; padding: 8px; text-align: left; }
        th { background-color: #333; }
        .money-in { color: #4CAF50; }
        .money-out { color: #f44336; }
        .timestamp { color: #888; font-size: 0.8em; }
        .filters { background: #2d2d2d; padding: 15px; margin: 10px 0; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>💰 Money Flow Transactions</h1>

      <div class="filters">
        <h2>🔍 Current Filters</h2>
        <p><strong>Total Transactions:</strong> ${transactions.length}</p>
        ${filters.handId ? `<p><strong>Hand ID:</strong> ${filters.handId}</p>` : ''}
        ${filters.playerId ? `<p><strong>Player ID:</strong> ${filters.playerId}</p>` : ''}
        ${filters.type ? `<p><strong>Transaction Types:</strong> ${filters.type.join(', ')}</p>` : ''}
        ${filters.limit ? `<p><strong>Limit:</strong> ${filters.limit}</p>` : ''}
        ${filters.since ? `<p><strong>Since:</strong> ${filters.since}</p>` : ''}
      </div>

      <table>
        <tr>
          <th>Time</th>
          <th>Hand ID</th>
          <th>Phase</th>
          <th>Player</th>
          <th>Type</th>
          <th>From</th>
          <th>To</th>
          <th>Amount</th>
          <th>Description</th>
        </tr>`;

    transactions.slice(-100).reverse().forEach(t => {
      const amountColor = t.fromAccount.includes('BANKROLL') ? 'money-out' : 'money-in';
      html += `
        <tr>
          <td class="timestamp">${new Date(t.timestamp).toLocaleString()}</td>
          <td>${t.handId || 'N/A'}</td>
          <td>${t.phase || 'N/A'}</td>
          <td>${t.playerName}</td>
          <td>${t.type}</td>
          <td>${t.fromAccount}</td>
          <td>${t.toAccount}</td>
          <td class="${amountColor}">${formatCents(t.amount)}</td>
          <td>${t.description}</td>
        </tr>`;
    });

    html += `</table></body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.log('error', 'api', 'Failed to get HTML money flow transactions', { error });
    res.status(500).send(`<h1>Error</h1><p>Failed to get money flow transactions: ${error}</p>`);
  }
});

// Cross-reference validation API endpoints
app.get('/api/cross-reference/validate-hand/:handId', (req: Request, res: Response) => {
  try {
    const handId = req.params.handId;
    if (!handId) {
      return res.status(400).json({ error: 'Hand ID is required' });
    }

    // Find the hand in history
    const handHistoryEntry = handHistory.find(h => h.handId === handId);
    if (!handHistoryEntry) {
      return res.status(404).json({ error: 'Hand not found in history' });
    }

    const report = crossReferenceService.validateHand(handHistoryEntry);
    res.json(report);
  } catch (error) {
    logger.log('error', 'api', 'Failed to validate hand cross-reference', { error });
    res.status(500).json({ error: 'Failed to validate hand cross-reference' });
  }
});

app.get('/api/cross-reference/validate-recent/:count?', (req: Request, res: Response) => {
  try {
    const count = parseInt(req.params.count || '10');
    const recentHands = handHistory.slice(-count);

    if (recentHands.length === 0) {
      return res.json({
        totalHands: 0,
        validHands: 0,
        invalidHands: 0,
        totalDiscrepancies: 0,
        discrepanciesBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        reports: []
      });
    }

    const summary = crossReferenceService.validateMultipleHands(recentHands);
    res.json(summary);
  } catch (error) {
    logger.log('error', 'api', 'Failed to validate recent hands cross-reference', { error });
    res.status(500).json({ error: 'Failed to validate recent hands cross-reference' });
  }
});

app.get('/api/cross-reference/current-hand', (req: Request, res: Response) => {
  try {
    if (!currentHandHistory || !gameState) {
      return res.json({ discrepancies: [], message: 'No active hand' });
    }

    const discrepancies = crossReferenceService.validateCurrentHand(currentHandHistory, gameState);
    res.json({
      handId: currentHandHistory.handId,
      phase: gameState.phase,
      discrepancies,
      isValid: discrepancies.length === 0
    });
  } catch (error) {
    logger.log('error', 'api', 'Failed to validate current hand cross-reference', { error });
    res.status(500).json({ error: 'Failed to validate current hand cross-reference' });
  }
});

// HTML-formatted cross-reference report for easy browser viewing
app.get('/api/cross-reference/validate-recent/:count/html', (req: Request, res: Response) => {
  try {
    const count = parseInt(req.params.count || '10');
    const recentHands = handHistory.slice(-count);

    if (recentHands.length === 0) {
      return res.send(`
        <html>
          <head><title>Cross-Reference Validation Report</title></head>
          <body>
            <h1>Cross-Reference Validation Report</h1>
            <p>No hands found to validate.</p>
          </body>
        </html>
      `);
    }

    const summary = crossReferenceService.validateMultipleHands(recentHands);

    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cross-Reference Validation Report</title>
          <style>
            body { font-family: monospace; margin: 20px; background: #1a1a1a; color: #e0e0e0; }
            .summary { background: #2a2a2a; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .valid { color: #4CAF50; }
            .invalid { color: #f44336; }
            .severity-low { color: #FFC107; }
            .severity-medium { color: #FF9800; }
            .severity-high { color: #f44336; }
            .severity-critical { color: #9C27B0; font-weight: bold; }
            .discrepancy { background: #3a3a3a; margin: 5px 0; padding: 10px; border-left: 4px solid #f44336; }
            .hand-report { border: 1px solid #444; margin: 10px 0; padding: 15px; border-radius: 5px; }
            .hand-valid { border-left: 4px solid #4CAF50; }
            .hand-invalid { border-left: 4px solid #f44336; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #444; padding: 8px; text-align: left; }
            th { background: #2a2a2a; }
          </style>
        </head>
        <body>
          <h1>Cross-Reference Validation Report</h1>
          <p>Generated: ${new Date().toLocaleString()}</p>

          <div class="summary">
            <h2>Summary</h2>
            <p><strong>Total Hands:</strong> ${summary.totalHands}</p>
            <p><strong class="valid">Valid Hands:</strong> ${summary.validHands}</p>
            <p><strong class="invalid">Invalid Hands:</strong> ${summary.invalidHands}</p>
            <p><strong>Total Discrepancies:</strong> ${summary.totalDiscrepancies}</p>
            <h3>Discrepancies by Severity:</h3>
            <ul>
              <li><span class="severity-low">Low:</span> ${summary.discrepanciesBySeverity.low}</li>
              <li><span class="severity-medium">Medium:</span> ${summary.discrepanciesBySeverity.medium}</li>
              <li><span class="severity-high">High:</span> ${summary.discrepanciesBySeverity.high}</li>
              <li><span class="severity-critical">Critical:</span> ${summary.discrepanciesBySeverity.critical}</li>
            </ul>
          </div>

          <h2>Hand Reports</h2>
    `;

    summary.reports.forEach(report => {
      const validClass = report.isValid ? 'hand-valid' : 'hand-invalid';
      const statusText = report.isValid ? 'VALID' : 'INVALID';

      html += `
        <div class="hand-report ${validClass}">
          <h3>Hand ${report.handId} - <span class="${report.isValid ? 'valid' : 'invalid'}">${statusText}</span></h3>
          <p><strong>Timestamp:</strong> ${new Date(report.timestamp).toLocaleString()}</p>

          <table>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Total Hand Actions</td>
              <td>${report.summary.totalHandActions}</td>
            </tr>
            <tr>
              <td>Total Money Transactions</td>
              <td>${report.summary.totalMoneyTransactions}</td>
            </tr>
            <tr>
              <td>Matched Actions</td>
              <td>${report.summary.matchedActions}</td>
            </tr>
            <tr>
              <td>Unmatched Actions</td>
              <td>${report.summary.unmatchedActions}</td>
            </tr>
            <tr>
              <td>Extra Transactions</td>
              <td>${report.summary.extraTransactions}</td>
            </tr>
            <tr>
              <td>Total Amount Discrepancy</td>
              <td>${report.summary.totalAmountDiscrepancy} pennies</td>
            </tr>
          </table>

          ${report.discrepancies.length > 0 ? `
            <h4>Discrepancies (${report.discrepancies.length})</h4>
            ${report.discrepancies.map(d => `
              <div class="discrepancy">
                <strong class="severity-${d.severity}">[${d.severity.toUpperCase()}]</strong>
                <strong>${d.type.replace('_', ' ').toUpperCase()}:</strong> ${d.description}<br/>
                ${d.playerId ? `<strong>Player:</strong> ${d.playerName || d.playerId}<br/>` : ''}
                ${d.expected !== undefined ? `<strong>Expected:</strong> ${d.expected}<br/>` : ''}
                ${d.actual !== undefined ? `<strong>Actual:</strong> ${d.actual}<br/>` : ''}
                ${d.transactionId ? `<strong>Transaction ID:</strong> ${d.transactionId}<br/>` : ''}
              </div>
            `).join('')}
          ` : '<p class="valid">No discrepancies found!</p>'}
        </div>
      `;
    });

    html += `
        </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    logger.log('error', 'api', 'Failed to generate HTML cross-reference report', { error });
    res.status(500).send(`<h1>Error</h1><p>Failed to generate cross-reference report: ${error}</p>`);
  }
});

// Post-deployment verification endpoint
app.get('/api/verify-deployment', (req, res) => {
  const deployInfo = {
    timestamp: new Date().toISOString(),
    commitHash: getCommitHash(),
    backendVersion: require('../package.json').version,
    nodeEnv: process.env.NODE_ENV,
    uptime: process.uptime()
  };
  
  // Test core functionality
  const verification = {
    deployment: deployInfo,
    checks: {
      server: { status: 'ok', message: 'Server is responding' },
      memory: { 
        status: process.memoryUsage().heapUsed < 100 * 1024 * 1024 ? 'ok' : 'warning', 
        usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB' 
      },
      socketio: { 
        status: io ? 'ok' : 'error', 
        message: io ? 'Socket.io initialized' : 'Socket.io not initialized' 
      },
      tableState: {
        status: tableState ? 'ok' : 'error',
        players: tableState ? tableState.seats.filter(p => p !== null).length : 0,
        config: tableState ? tableState.config : null
      }
    },
    overallStatus: 'ok'
  };
  
  // Check if any critical systems failed
  const hasErrors = Object.values(verification.checks).some(check => check.status === 'error');
  if (hasErrors) {
    verification.overallStatus = 'error';
    res.status(500);
  }
  
  res.json(verification);
});

// Simple health endpoint (legacy compatibility)
app.get('/status', (_req: Request, res: Response) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// Authentication routes
app.use('/auth', authRoutes);

// Test routes (development only)
// Commented out - test routes file doesn't exist yet
// if (process.env.NODE_ENV !== 'production') {
//   const testRoutes = require('./routes/test').default;
//   app.use('/test', testRoutes);
// }

// API route prefix for backend endpoints
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({ 
    players: socketIdToPlayer.size,
    gameActive: !!gameState,
    phase: gameState?.phase || 'Lobby'
  });
});

// Debug/logs endpoint for troubleshooting
app.get('/api/debug', (_req: Request, res: Response) => {
  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    },
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      CORS_ORIGINS: process.env.CORS_ORIGINS
    },
    game: {
      players: socketIdToPlayer.size,
      gameActive: !!gameState,
      phase: gameState?.phase || 'Lobby',
      socketConnections: Array.from(socketIdToPlayer.keys()).length,
      gameStateDetails: gameState ? {
        phase: gameState.phase,
        pot: gameState.pot,
        currentBet: gameState.currentBet,
        phaseEndsAtMs: gameState.phaseEndsAtMs,
        currentTurnPlayerId: gameState.currentTurnPlayerId
      } : null,
      canStartGame: canStartGame(),
      humanCount: getHumanSeatedPlayers().length,
      totalCount: getSeatedPlayers().length
    },
    paths: {
      __dirname: __dirname,
      publicPath: process.env.NODE_ENV === 'production' ? path.join(__dirname, 'public') : 'N/A'
    }
  });
});

// Add game state reset endpoint for debugging
// Debug endpoint to show current seats
app.get('/api/debug/seats', (_req: Request, res: Response) => {
  if (gameState) {
    res.json({
      gamePhase: gameState.phase,
      seats: gameState.seats.map((seat, index) => ({
        index,
        playerId: seat.playerId,
        name: seat.name,
        isAI: seat.isAI,
        bankroll: seat.tableStack,
        hasFolded: seat.hasFolded
      }))
    });
  } else {
    res.json({ gamePhase: null, seats: [] });
  }
});

app.post('/api/debug/reset-game', (_req: Request, res: Response) => {
  console.log('🔄 ADMIN: Forcing game state reset');
  
  if (gameState) {
    console.log(`🔄 Resetting stuck game in phase: ${gameState.phase}`);
    gameState = null;
    
    // Broadcast updated state
    broadcastGameState();
    broadcastTableState();
    broadcastLobbyState();
    
    res.json({ success: true, message: 'Game state reset successfully' });
  } else {
    res.json({ success: true, message: 'No game state to reset' });
  }
});

app.post('/api/debug/reset-table', async (_req: Request, res: Response) => {
  console.log('🔄 ADMIN: Forcing complete table reset (game + seats)');

  const previousSeatedCount = tableState.seats.filter(s => s !== null).length;
  let totalRefunded = 0;
  let playersRefunded = 0;

  try {
    // Refund current bets before clearing table
    if (gameState && gameState.seats) {
      console.log('🔄 Refunding current bets before table reset...');

      for (const gameSeat of gameState.seats) {
        if (gameSeat && gameSeat.currentBet > 0 && !gameSeat.isAI) {
          const refundAmount = gameSeat.currentBet;
          console.log(`🔄 Refunding ${refundAmount} to ${gameSeat.name} (${gameSeat.playerId})`);

          try {
            // Find user in database by playerId (which is googleId for human players)
            await prisma.user.update({
              where: { googleId: gameSeat.playerId },
              data: {
                bankroll: { increment: refundAmount }
              }
            });

            logBankrollOperation('TABLE_RESET_REFUND',
              `Refunded ${refundAmount} to ${gameSeat.name} due to table reset`, {
                playerId: gameSeat.playerId,
                amount: refundAmount,
                previousBet: gameSeat.currentBet
              });

            // Also log to money flow service
            logMoneyFlow(
              'TABLE_RESET_REFUND',
              gameSeat.playerId,
              gameSeat.name,
              'MAIN_POT',
              'PLAYER_BANKROLL',
              refundAmount,
              `${gameSeat.name} received ${refundAmount} pennies refund due to table reset`,
              {
                previousBet: gameSeat.currentBet,
                phase: 'TableReset'
              }
            );

            totalRefunded += refundAmount;
            playersRefunded++;
          } catch (dbError) {
            console.error(`Failed to refund ${refundAmount} to ${gameSeat.name}:`, dbError);
            // Continue with reset even if refund fails for one player
          }
        }
      }
    }

    // Reset game state
    if (gameState) {
      console.log(`🔄 Resetting game in phase: ${gameState.phase}`);
      gameState = null;
    }

    // Clear all timers
    if (phaseTimer) {
      clearTimeout(phaseTimer);
      phaseTimer = null;
    }
    if (turnTimer) {
      clearTimeout(turnTimer);
      turnTimer = null;
    }

    // Reset table state - kick all players out of seats
    tableState.seats = Array(8).fill(null);

    // Clear disconnection timeouts
    disconnectedPlayers.clear();

    // Broadcast updated states
    broadcastGameState();
    broadcastTableState();
    broadcastLobbyState();

    const message = playersRefunded > 0
      ? `Table reset successfully - ${previousSeatedCount} players removed, ${playersRefunded} players refunded $${totalRefunded.toFixed(2)}`
      : `Table reset successfully - ${previousSeatedCount} players removed from seats`;

    console.log(`🔄 Table reset complete: ${message}`);
    res.json({
      success: true,
      message,
      seatsCleared: previousSeatedCount,
      playersRefunded,
      totalRefunded
    });

  } catch (error) {
    console.error('Error during table reset:', error);
    res.status(500).json({
      success: false,
      message: 'Table reset failed due to database error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Logs API endpoints
app.get('/api/logs', (req: Request, res: Response) => {
  const { level, category, limit, since, playerId, search } = req.query;
  
  const filters: Parameters<typeof logger.getLogs>[0] = {};
  if (level) filters.level = level as any;
  if (category) filters.category = category as any;
  if (limit) filters.limit = parseInt(limit as string);
  if (since) filters.since = since as string;
  if (playerId) filters.playerId = playerId as string;
  if (search) filters.search = search as string;
  
  const logs = logger.getLogs(filters);
  
  res.json(logs);
});

app.get('/api/logs/stats', (_req: Request, res: Response) => {
  res.json(logger.getStats());
});

app.get('/api/logs/errors', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  res.json(logger.getRecentErrors(limit));
});

app.post('/api/logs/clear', (_req: Request, res: Response) => {
  logger.clearLogs();
  res.json({ message: 'Logs cleared successfully' });
});

app.get('/api/logs/export', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="logs.json"');
  res.send(logger.exportLogs());
});

// Table Configuration API endpoints
app.get('/api/config', (_req: Request, res: Response) => {
  try {
    const config = configService.getConfig();
    res.json({
      ...config,
      hasPendingChanges: pendingConfigChanges !== null
    });
  } catch (error) {
    logger.log('error', 'api', 'Failed to get config', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

app.post('/api/config/reload', (_req: Request, res: Response) => {
  try {
    const config = configService.reloadConfig();
    logger.log('info', 'api', 'Configuration reloaded via API');
    res.json({ 
      message: 'Configuration reloaded successfully',
      config
    });
  } catch (error) {
    logger.log('error', 'api', 'Failed to reload config', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to reload configuration' });
  }
});

app.put('/api/config', (req: Request, res: Response) => {
  try {
    const partialConfig = req.body;
    
    // If a game is in progress, defer the config changes
    if (gameState && gameState.phase !== 'Lobby' && gameState.phase !== 'HandEnd') {
      pendingConfigChanges = partialConfig;
      logger.log('info', 'api', 'Configuration changes deferred until hand ends', { partialConfig });
      res.json({ 
        message: 'Configuration changes will be applied after the current hand',
        pending: true,
        config: configService.getConfig()
      });
    } else {
      // Apply immediately if no game in progress
      const config = configService.updateConfig(partialConfig);
      logger.log('info', 'api', 'Configuration updated immediately', { partialConfig });
      res.json({ 
        message: 'Configuration updated successfully',
        pending: false,
        config
      });
    }
  } catch (error) {
    logger.log('error', 'api', 'Failed to update config', { error: error instanceof Error ? error.message : String(error) });
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/config/preset/:presetName', (req: Request, res: Response) => {
  try {
    const presetName = req.params.presetName;
    if (!presetName) {
      throw new Error('Preset name is required');
    }
    const config = configService.applyPreset(presetName);
    logger.log('info', 'api', 'Configuration preset applied via API', { presetName });
    res.json({ 
      message: `Preset '${presetName}' applied successfully`,
      config
    });
  } catch (error) {
    logger.log('error', 'api', 'Failed to apply preset', { error: error instanceof Error ? error.message : String(error), preset: req.params.presetName });
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/config/presets', (_req: Request, res: Response) => {
  try {
    const presets = configService.getPresets();
    res.json(presets);
  } catch (error) {
    logger.log('error', 'api', 'Failed to get presets', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to get presets' });
  }
});

// This catch-all is now moved to AFTER static files are served

const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: corsOptions
});

// Share session with Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request as any, {} as any, next as any);
});

const socketIdToPlayer = new Map<string, Player>();
const aiPlayers: Player[] = [];

// Durable player identity system - foundation for multi-table architecture
const socketToDurableId = new Map<string, string>(); // socketId -> durablePlayerId
const durableIdToSocket = new Map<string, string>(); // durablePlayerId -> current socketId
const durableIdToPlayer = new Map<string, Player>(); // durablePlayerId -> player data

function getDurablePlayerId(googleId: string | null, name: string): string {
  // Use googleId for authenticated users, fallback to name-based ID for guests
  return googleId || `guest_${name.replace(/\s+/g, '_')}`;
}

function registerPlayerConnection(socket: any, player: Player): void {
  const durableId = getDurablePlayerId(player.googleId || null, player.name);
  
  // Update mappings
  socketToDurableId.set(socket.id, durableId);
  durableIdToSocket.set(durableId, socket.id);
  durableIdToPlayer.set(durableId, player);
  
  // Keep legacy mapping for compatibility
  socketIdToPlayer.set(socket.id, player);
  
  console.log(`🆔 Player mapping: ${player.name} -> durable:${durableId} -> socket:${socket.id.slice(0,6)}`);
}

function getCurrentSocketId(durablePlayerId: string): string | undefined {
  return durableIdToSocket.get(durablePlayerId);
}

function getDurablePlayerIdBySocket(socketId: string): string | undefined {
  return socketToDurableId.get(socketId);
}

function updateGameStateWithDurableIds(): void {
  if (!gameState) return;
  
  // Convert currentTurnPlayerId from socket ID to durable ID
  if (gameState.currentTurnPlayerId) {
    const durableId = getDurablePlayerIdBySocket(gameState.currentTurnPlayerId);
    if (durableId) {
      console.log(`🔄 Converting currentTurnPlayerId: ${gameState.currentTurnPlayerId.slice(0,6)} -> ${durableId}`);
      gameState.currentTurnPlayerId = durableId;
    }
  }
  
  // Convert seat playerIds from socket IDs to durable IDs
  for (const seat of gameState.seats) {
    if (seat && seat.playerId) {
      const durableId = getDurablePlayerIdBySocket(seat.playerId);
      if (durableId) {
        console.log(`🔄 Converting seat playerId: ${seat.playerId.slice(0,6)} -> ${durableId} (${seat.name})`);
        seat.playerId = durableId;
      }
    }
  }
}

function enrichGameStateForBroadcast(gameState: any): any {
  // Convert durable IDs back to current socket IDs for frontend compatibility
  const enriched = { ...gameState };
  
  // Convert currentTurnPlayerId from durable ID to current socket ID
  if (enriched.currentTurnPlayerId) {
    const socketId = getCurrentSocketId(enriched.currentTurnPlayerId);
    if (socketId) {
      enriched.currentTurnPlayerId = socketId;
    }
  }
  
  // Convert seat playerIds from durable IDs to current socket IDs
  enriched.seats = enriched.seats.map((seat: any) => {
    if (seat && seat.playerId) {
      const socketId = getCurrentSocketId(seat.playerId);
      if (socketId) {
        return { ...seat, playerId: socketId };
      }
    }
    return seat;
  });
  
  return enriched;
}

// Disconnection timeout tracking
interface DisconnectedPlayer {
  player: Player;
  disconnectedAt: number;
  actionTimeoutId?: NodeJS.Timeout;
  foldTimeoutId?: NodeJS.Timeout;
  kickTimeoutId?: NodeJS.Timeout;
  wasDisconnectedDuringTurn?: boolean;
}
const disconnectedPlayers = new Map<string, DisconnectedPlayer>(); // playerId -> DisconnectedPlayer

let gameState: GameState | null = null;
let countdownTimer: NodeJS.Timeout | null = null;

// Deferred config changes
let pendingConfigChanges: Partial<TableConfigType> | null = null;

// Hand history storage
interface HandHistoryEntry {
  handId: string;
  timestamp: string;
  players: Array<{
    playerId: string;
    name: string;
    isAI: boolean;
    startingBankroll: number;
    endingBankroll: number;
    role?: string;
    finalDice?: number[];
  }>;
  rounds: Array<{
    roundNumber: number;
    rollPhase: {
      diceAfterRoll: number[];
      playerDice: { [playerId: string]: number[] };
    };
    lockPhase?: {
      locks: { [playerId: string]: number[] };
      publicDice: { [playerId: string]: number[] };
      privateDice: { [playerId: string]: number[] };
    };
    bettingPhase?: {
      actions: Array<{
        playerId: string;
        playerName: string;
        action: 'bet' | 'call' | 'fold' | 'check' | 'raise';
        amount?: number;
        timestamp: string;
      }>;
      potAtEnd: number;
    };
  }>;
  showdown?: {
    finalHands: { [playerId: string]: { dice: number[], role: string, rankScore: number } };
    payouts: { [playerId: string]: number };
    cargoChestAward?: { playerId: string, amount: number, trigger: string };
  };
  tableConfig: {
    table: any;
    betting: any;
    payouts: any;
    house: any;
    chest: any;
    bust_fee: any;
    advanced: any;
    timing: any;
    display: any;
  };
  phases: Array<{
    phase: GamePhase;
    timestamp: string;
    actions: Array<{
      playerId: string;
      playerName: string;
      action: string;
      amount?: number;
      dice?: number[];
    }>;
  }>;
  pot: number;
  winners: string[];
  cargoChest: number;
}

const handHistory: HandHistoryEntry[] = [];
let currentHandHistory: HandHistoryEntry | null = null;
function getMaxHandHistory(): number {
  return getHistoryLimit('max_stored');
}

// Initialize table state with config from configService
const initializeTableState = (): TableState => {
  const config = configService.getConfig();
  return {
    seats: Array(8).fill(null),
    config: {
      minHumanPlayers: config.table.minHumanPlayers,
      targetTotalPlayers: config.table.targetTotalPlayers,
      maxSeats: config.table.maxSeats,
      cargoChestLearningMode: config.table.cargoChestLearningMode
    }
  };
};

// Table configuration and state
const tableState: TableState = initializeTableState();
let phaseTimer: NodeJS.Timeout | null = null;
let turnTimer: NodeJS.Timeout | null = null;

// Initialize debug middleware
const gameDebugger = new GameDebugger(io);

// Load AI profiles from JSON file
let aiProfiles: AIProfile[] = [];
try {
  const profilesPath = path.join(__dirname, 'ai-profiles.json');
  const profilesData = fs.readFileSync(profilesPath, 'utf8');
  aiProfiles = JSON.parse(profilesData);
  console.log(`[AI] Loaded ${aiProfiles.length} AI profiles`);
} catch (error) {
  console.warn('[AI] Failed to load AI profiles, using basic AI behavior:', error);
  // Fallback to basic profiles
  aiProfiles = [
    {
      name: 'Basic AI',
      style: 'Balanced',
      riskTolerance: 0.5,
      bluffFrequency: 0.1,
      foldThreshold: 3,
      raiseMultiplier: 1.0,
      rolePriority: ['Ship', 'Captain', 'Crew', 'Cargo3', 'Cargo2', 'Cargo1'],
      mistakeChance: 0.1
    }
  ];
}

function assignAIProfile(): AIProfile {
  // Randomly select an AI profile with some variance
  const profile = aiProfiles[Math.floor(Math.random() * aiProfiles.length)];
  if (!profile) {
    // Fallback profile
    return {
      name: 'Basic AI',
      style: 'Balanced',
      riskTolerance: 0.5,
      bluffFrequency: 0.1,
      foldThreshold: 3,
      raiseMultiplier: 1.0,
      rolePriority: ['Ship', 'Captain', 'Crew', 'Cargo3', 'Cargo2', 'Cargo1'],
      mistakeChance: 0.1
    };
  }
  
  // Add ±10% variance to numeric values to prevent robotic behavior
  const variance = () => 0.9 + Math.random() * 0.2; // 0.9 to 1.1 multiplier
  
  return {
    name: profile.name,
    style: profile.style,
    rolePriority: profile.rolePriority,
    riskTolerance: Math.max(0, Math.min(1, profile.riskTolerance * variance())),
    bluffFrequency: Math.max(0, Math.min(1, profile.bluffFrequency * variance())),
    foldThreshold: Math.max(1, profile.foldThreshold * variance()),
    raiseMultiplier: Math.max(0.1, profile.raiseMultiplier * variance()),
    mistakeChance: Math.max(0, Math.min(1, profile.mistakeChance * variance()))
  };
}

function getLobbyState(): LobbyState {
  const humanPlayers = Array.from(socketIdToPlayer.values());
  return { players: [...humanPlayers, ...aiPlayers] };
}

function broadcastLobbyState(): void {
  const lobbyState = getLobbyState();
  logger.log('info', 'socket', `Broadcasting lobby state with ${lobbyState.players.length} players`);
  
  lobbyState.players.forEach(p => {
    logger.log('info', 'socket', `Lobby player: ${p.name}`, {
      playerId: p.id,
      bankroll: p.bankroll / 100,
      isAI: p.isAI
    });
  });
  
  io.emit('lobby_state', lobbyState);
  gameDebugger.updateLobbyState(lobbyState);
}

function broadcastGameState(): void {
  if (gameState) {
    console.log(`📡 Broadcasting game state: phase=${gameState.phase}, currentTurnPlayerId=${gameState.currentTurnPlayerId?.slice(0,6)}`);
    
    // First convert to frontend-compatible format (durable IDs -> socket IDs)
    const frontendGameState = enrichGameStateForBroadcast(gameState);
    
    // Then enrich with stamps data for frontend
    const enrichedGameState = {
      ...frontendGameState,
      seats: frontendGameState.seats.map((seat: any) => {
        const stamps = getPlayerStamps(seat.playerId);
        const maxStamps = Math.max(...frontendGameState.seats.map((s: any) => getPlayerStamps(s.playerId).currentCount));
        const gracePeriodEnabled = !configService.getConfig().table.cargoChestLearningMode;
        const isEligible = stamps.currentCount >= cargoConfig.stamps.required || 
          (gracePeriodEnabled && cargoConfig.stamps.fresh_table_fallback && maxStamps <= cargoConfig.stamps.fresh_threshold);
        
        return {
          ...seat,
          stamps: {
            current: stamps.currentCount,
            window: cargoConfig.stamps.window_hands,
            eligible: isEligible
          }
        };
      })
    };
    
    console.log('📡 Broadcasting game_state with seats:', enrichedGameState.seats.map((s: any) => `${s.name}(${s.isAI ? 'AI' : 'Human'}, $${s.tableStack/100})`));
    io.emit('game_state', enrichedGameState);
    gameDebugger.updateGameState(gameState);
  }
}

// Table management functions
function broadcastTableState(): void {
  const tableStateData = {
    seats: tableState.seats,
    config: tableState.config,
    cargoChest: tableState.cargoChest
  };
  console.log(`📤 Broadcasting table_state:`, {
    seatedPlayers: tableState.seats.filter(s => s !== null).length,
    seats: tableState.seats.map((s, i) => s ? `${i}: ${s.name} (${s.id.slice(0,6)})` : `${i}: empty`)
  });
  io.emit('table_state', tableStateData);
}

function getSeatedPlayers(): Player[] {
  return tableState.seats.filter((p): p is Player => p !== null);
}

// Disconnection timeout management functions
function startDisconnectionTimeouts(player: Player, wasDisconnectedDuringTurn: boolean = false): void {
  const config = configService.getConfig();
  const sessionConfig = config.timing.session;
  
  console.log(`⏰ Starting disconnection timeouts for ${player.name}`);
  console.log(`⏰ Timeouts: action=${sessionConfig.disconnect_action_timeout_seconds}s, fold=${sessionConfig.disconnect_fold_timeout_seconds}s, kick=${sessionConfig.disconnect_kick_timeout_minutes}min`);
  
  const disconnectedPlayer: DisconnectedPlayer = {
    player,
    disconnectedAt: Date.now(),
    wasDisconnectedDuringTurn
  };
  
  // Action timeout - take default action if it's their turn
  if (gameState && gameState.currentTurnPlayerId === player.id) {
    disconnectedPlayer.actionTimeoutId = setTimeout(() => {
      handleDisconnectedPlayerAction(player.id);
    }, sessionConfig.disconnect_action_timeout_seconds * 1000);
  }
  
  // Fold timeout - fold from current hand
  disconnectedPlayer.foldTimeoutId = setTimeout(() => {
    handleDisconnectedPlayerFold(player.id);
  }, sessionConfig.disconnect_fold_timeout_seconds * 1000);
  
  // Kick timeout - remove from seat
  disconnectedPlayer.kickTimeoutId = setTimeout(() => {
    handleDisconnectedPlayerKick(player.id);
  }, sessionConfig.disconnect_kick_timeout_minutes * 60 * 1000);
  
  disconnectedPlayers.set(player.id, disconnectedPlayer);
}

function clearDisconnectionTimeouts(playerId: string): void {
  const disconnectedPlayer = disconnectedPlayers.get(playerId);
  if (disconnectedPlayer) {
    console.log(`⏰ Clearing disconnection timeouts for ${disconnectedPlayer.player.name}`);
    
    if (disconnectedPlayer.actionTimeoutId) {
      clearTimeout(disconnectedPlayer.actionTimeoutId);
    }
    if (disconnectedPlayer.foldTimeoutId) {
      clearTimeout(disconnectedPlayer.foldTimeoutId);
    }
    if (disconnectedPlayer.kickTimeoutId) {
      clearTimeout(disconnectedPlayer.kickTimeoutId);
    }
    
    // If they were disconnected during their turn, resume the phase timer
    if (disconnectedPlayer.wasDisconnectedDuringTurn) {
      console.log(`⏰ Player ${disconnectedPlayer.player.name} reconnected during their turn window - resuming phase timer`);
      resumePhaseTimerIfNeeded();
    }
    
    disconnectedPlayers.delete(playerId);
  }
}

function resumePhaseTimerIfNeeded(): void {
  if (!gameState || phaseTimer) return; // Already have a timer running
  
  // Resume phase timer based on current phase
  if (gameState.phase.includes('Lock')) {
    console.log(`⏰ Resuming locking phase timer`);
    phaseTimer = setTimeout(() => {
      if (!gameState) return;
      // Auto-lock dice for players who haven't locked enough
      for (const s of gameState.seats) {
        if (!s.hasFolded && s.lockAllowance > 0) {
          if (s.isAI) {
            makeAILockingDecision(s);
          } else {
            // Random locking for human players who didn't act in time
            const unlockedIndices = s.dice
              .map((d, i) => (!d.locked ? i : -1))
              .filter(i => i >= 0);
            while (s.lockAllowance > 0 && unlockedIndices.length > 0) {
              const randomIndex = Math.floor(Math.random() * unlockedIndices.length);
              const dieIndex = unlockedIndices[randomIndex]!;
              s.dice[dieIndex]!.locked = true;
              s.lockAllowance -= 1;
              unlockedIndices.splice(randomIndex, 1);
            }
            // Update dice visibility for random auto-locks
            updateDicePublicVisibility(s);
          }
        }
      }
      gameState.phase = nextPhase(gameState.phase);
      onEnterPhase();
      broadcastGameState();
    }, getPhaseTimeout('lock'));
  } else if (gameState.phase.includes('Bet')) {
    console.log(`⏰ Resuming betting phase timer`);
    phaseTimer = setTimeout(() => {
      if (!gameState) return;
      gameState.phase = nextPhase(gameState.phase);
      onEnterPhase();
      broadcastGameState();
    }, getPhaseTimeout('betting'));
  }
}

function handleDisconnectedPlayerAction(playerId: string): void {
  const disconnectedPlayer = disconnectedPlayers.get(playerId);
  if (!disconnectedPlayer || !gameState) return;
  
  console.log(`⏰ Taking default action for disconnected player ${disconnectedPlayer.player.name}`);
  
  // Find their game seat
  const gameSeat = gameState.seats.find(s => s.playerId === playerId);
  if (!gameSeat || gameSeat.hasFolded) return;
  
  // Take default action based on current game phase and betting situation
  if (gameState.currentTurnPlayerId === playerId) {
    if (gameState.phase.includes('Bet')) {
      // Betting phase: check if possible, otherwise fold
      if (gameState.currentBet === 0 || (gameSeat.currentBet || 0) >= gameState.currentBet) {
        // Can check
        console.log(`⏰ Auto-checking for ${disconnectedPlayer.player.name}`);
        gameSeat.hasActed = true;
        advanceTurn();
        resumePhaseTimerIfNeeded();
        broadcastGameState();
      } else {
        // Must call or fold - default to fold to be conservative
        console.log(`⏰ Auto-folding ${disconnectedPlayer.player.name} (cannot check)`);
        gameSeat.hasFolded = true;
        gameSeat.hasActed = true;
        advanceTurn();
        resumePhaseTimerIfNeeded();
        broadcastGameState();
      }
    } else if (gameState.phase.includes('Lock')) {
      // Locking phase: mark as done (no dice locked)
      console.log(`⏰ Auto-completing lock phase for ${disconnectedPlayer.player.name}`);
      gameSeat.lockingDone = true;
      
      // Check if all players finished locking
      const allDone = gameState.seats.every((s) => {
        if (s.hasFolded) return true;
        const locked = s.dice.filter(d => d.locked).length;
        const required = s.minLocksRequired || 1;
        return locked >= required && (s.isAI || s.lockingDone);
      });
      if (allDone) {
        gameState.phase = nextPhase(gameState.phase);
        onEnterPhase();
      }
      broadcastGameState();
    }
  }
}

function handleDisconnectedPlayerFold(playerId: string): void {
  const disconnectedPlayer = disconnectedPlayers.get(playerId);
  if (!disconnectedPlayer || !gameState) return;
  
  console.log(`⏰ Auto-folding disconnected player ${disconnectedPlayer.player.name}`);
  
  const gameSeat = gameState.seats.find(s => s.playerId === playerId);
  if (gameSeat && !gameSeat.hasFolded) {
    gameSeat.hasFolded = true;
    
    // If it was their turn, advance to next player
    if (gameState.currentTurnPlayerId === playerId) {
      advanceTurn();
    }
    
    broadcastGameState();
    
    // Check if game should end due to insufficient players
    const activePlayers = gameState.seats.filter(s => s && !s.hasFolded);
    if (activePlayers.length <= 1 && gameState.phase !== 'HandEnd' && gameState.phase !== 'Lobby') {
      console.log(`🎲 Game ending due to insufficient active players after disconnection fold`);
      gameState.phase = 'HandEnd';
      onEnterPhase();
    }
  }
}

function handleDisconnectedPlayerKick(playerId: string): void {
  const disconnectedPlayer = disconnectedPlayers.get(playerId);
  if (!disconnectedPlayer) return;
  
  console.log(`⏰ Kicking disconnected player ${disconnectedPlayer.player.name} from seat`);
  
  // Remove from table seat
  const tableSeatIndex = tableState.seats.findIndex(s => s?.id === playerId);
  if (tableSeatIndex !== -1 && tableState.seats[tableSeatIndex]) {
    const seat = tableState.seats[tableSeatIndex]!;
    
    // Return their seat bankroll to database if they're human
    if (disconnectedPlayer.player.googleId && seat.tableStack && seat.tableStack > 0) {
      console.log(`💰 Returning seat bankroll to ${disconnectedPlayer.player.name}: ${seat.tableStack / 100} dollars`);
      updateUserBankroll(disconnectedPlayer.player.googleId, seat.tableStack / 100);
    }
    
    // Clear the seat
    tableState.seats[tableSeatIndex] = null;
    console.log(`🪑 Cleared seat ${tableSeatIndex} for kicked player ${disconnectedPlayer.player.name}`);
  }
  
  // Remove from game seat (already folded by fold timeout)
  // Clean up tracking
  socketIdToPlayer.delete(playerId);
  clearDisconnectionTimeouts(playerId);
  
  // Broadcast updated states
  broadcastTableState();
  broadcastGameState();
}

function getHumanSeatedPlayers(): Player[] {
  return getSeatedPlayers().filter(p => !p.isAI);
}

function getAISeatedPlayers(): Player[] {
  return getSeatedPlayers().filter(p => p.isAI);
}

function findEmptySeat(): number {
  return tableState.seats.findIndex(seat => seat === null);
}

function seatPlayer(player: Player, seatBankroll?: number): boolean {
  const seatIndex = findEmptySeat();
  if (seatIndex === -1) {
    logBankrollOperation('SEAT_FAILED', `No empty seat for player ${player.name} (${player.id})`);
    return false;
  }

  // Create a seat entry with the specified tableStack (or player's full bankroll)
  const actualTableStack = seatBankroll !== undefined ? seatBankroll : player.bankroll;
  const seatedPlayer = {
    ...player,
    tableStack: actualTableStack  // Set tableStack, not bankroll
  };

  logBankrollOperation('SEAT_SUCCESS', `${player.name} (${player.id}) seated at index ${seatIndex}`, {
    playerBankrollRemaining: player.bankroll / 100,
    seatBankroll: actualTableStack / 100,
    totalBankroll: (player.bankroll + actualTableStack) / 100,
    usedCustomAmount: seatBankroll !== undefined
  });

  tableState.seats[seatIndex] = seatedPlayer;
  return true;
}

function standUpPlayer(playerId: string): boolean {
  const seatIndex = tableState.seats.findIndex(p => p?.id === playerId);
  if (seatIndex === -1) {
    logBankrollOperation('STANDUP_FAILED', `No seat found for player ${playerId}`);
    return false;
  }
  
  // Return seat bankroll to the player's main bankroll
  const seatedPlayer = tableState.seats[seatIndex];
  if (seatedPlayer) {
    const actualPlayer = socketIdToPlayer.get(playerId);
    if (actualPlayer) {
      const seatBankrollBefore = seatedPlayer.bankroll;
      const playerBankrollBefore = actualPlayer.bankroll;
      actualPlayer.bankroll += seatedPlayer.bankroll; // Return chips to player

      // Log standup return to money flow service
      if (seatBankrollBefore > 0) {
        logMoneyFlow(
          'STANDUP_RETURN',
          playerId,
          seatedPlayer.name,
          'TABLE_STACK',
          'PLAYER_BANKROLL',
          seatBankrollBefore,
          `${seatedPlayer.name} stood up and returned ${seatBankrollBefore} pennies to player bankroll`,
          {
            seatBankrollBefore,
            playerBankrollBefore,
            playerBankrollAfter: actualPlayer.bankroll,
            seatIndex,
            phase: 'Lobby'
          }
        );
      }

      logBankrollOperation('STANDUP_SUCCESS', `${seatedPlayer.name} (${playerId}) stood up from seat ${seatIndex}`, {
        seatBankroll: seatBankrollBefore / 100,
        playerBankrollBefore: playerBankrollBefore / 100,
        playerBankrollAfter: actualPlayer.bankroll / 100,
        transferredAmount: seatBankrollBefore / 100
      });
      
      // Persist the new bankroll to database
      if (actualPlayer.googleId) {
        updateUserBankroll(actualPlayer.googleId, actualPlayer.bankroll / 100);
      }
      
      // Remove table bankroll from database
      removeTableBankroll(actualPlayer);
    } else {
      logBankrollOperation('STANDUP_ERROR', `No player found in socketIdToPlayer for ${playerId}`, {
        seatIndex,
        seatBankroll: seatedPlayer.bankroll / 100
      });
    }
  } else {
    logBankrollOperation('STANDUP_ERROR', `Seat ${seatIndex} is null or undefined`);
  }
  
  tableState.seats[seatIndex] = null;
  return true;
}

function cleanupDisconnectedPlayer(disconnectedPlayer: Player): void {
  console.log(`🧹 Cleaning up disconnected player: ${disconnectedPlayer.name} (${disconnectedPlayer.id})`);
  
  // Check if they reconnected by looking for their googleId in current players
  if (disconnectedPlayer.googleId) {
    const reconnectedPlayer = Array.from(socketIdToPlayer.values()).find(p => p.googleId === disconnectedPlayer.googleId);
    if (reconnectedPlayer) {
      console.log(`✅ Player ${disconnectedPlayer.name} has reconnected as ${reconnectedPlayer.name}, skipping cleanup`);
      return;
    }
  }
  
  // Find and clean up table seat
  const tableSeatIndex = tableState.seats.findIndex(s => s?.id === disconnectedPlayer.id);
  if (tableSeatIndex !== -1) {
    const seat = tableState.seats[tableSeatIndex];
    if (seat) {
      console.log(`💰 Returning seat balance to ${disconnectedPlayer.name}: ${seat.tableStack ? seat.tableStack / 100 : 0} dollars`);

      // If they have a googleId, return money to database
      if (disconnectedPlayer.googleId && seat.tableStack && seat.tableStack > 0) {
        // Get their current database bankroll and add seat bankroll
        pgPool.query('SELECT bankroll FROM users WHERE "googleId" = $1', [disconnectedPlayer.googleId])
          .then(result => {
            if (result.rows.length > 0) {
              const currentDbBankroll = result.rows[0].bankroll;
              const newDbBankroll = currentDbBankroll + (seat.tableStack! / 100); // Convert pennies to dollars
              return updateUserBankroll(disconnectedPlayer.googleId!, newDbBankroll);
            }
          })
          .catch(error => {
            console.error(`Failed to return bankroll for ${disconnectedPlayer.name}:`, error);
          });
      }
      
      // Clear the seat
      tableState.seats[tableSeatIndex] = null;
      console.log(`🪑 Cleared seat ${tableSeatIndex} for disconnected player ${disconnectedPlayer.name}`);
    }
  }
  
  // Clean up game seat if in active game
  if (gameState) {
    const gameSeatIndex = gameState.seats.findIndex(s => s.playerId === disconnectedPlayer.id);
    if (gameSeatIndex !== -1) {
      const gameSeat = gameState.seats[gameSeatIndex];
      if (gameSeat) {
        // Don't clean up AI players - they should persist
        if (gameSeat.isAI) {
          console.log(`🤖 SKIPPING cleanup for AI player ${disconnectedPlayer.name} - AI players should persist`);
          return;
        }
        console.log(`🎮 Cleaning up game seat for ${disconnectedPlayer.name}, bankroll: ${gameSeat.tableStack / 100}`);
        
        // Return game seat bankroll if different from table seat
        if (disconnectedPlayer.googleId && gameSeat.tableStack > 0) {
          pgPool.query('SELECT bankroll FROM users WHERE "googleId" = $1', [disconnectedPlayer.googleId])
            .then(result => {
              if (result.rows.length > 0) {
                const currentDbBankroll = result.rows[0].bankroll;
                const newDbBankroll = currentDbBankroll + (gameSeat.tableStack / 100);
                return updateUserBankroll(disconnectedPlayer.googleId!, newDbBankroll);
              }
            })
            .catch(error => {
              console.error(`Failed to return game bankroll for ${disconnectedPlayer.name}:`, error);
            });
        }
        
        // Set as folded and remove from game
        console.log(`🚫 CLEANUP: Folding seat for ${disconnectedPlayer.name} (isAI: ${disconnectedPlayer.isAI})`);
        gameSeat.hasFolded = true;
        
        // Check if this affects the current game
        const activePlayers = gameState.seats.filter(s => !s.hasFolded);
        if (activePlayers.length <= 1 && gameState.phase !== 'HandEnd' && gameState.phase !== 'Lobby') {
          console.log(`🎲 Game ending due to insufficient active players after cleanup`);
          gameState.phase = 'HandEnd';
          onEnterPhase();
        }
      }
    }
  }
  
  // Remove from socket mapping
  socketIdToPlayer.delete(disconnectedPlayer.id);
  
  // Rebalance AI and broadcast updates
  autoFillAI();
  broadcastTableState();
  if (gameState) broadcastGameState();
  
  console.log(`✅ Cleanup complete for ${disconnectedPlayer.name}`);
}

function auditSystemMoney(): { totalSystemMoney: number, breakdown: any } {
  console.log('🔍 === MONEY AUDIT START ===');
  
  let totalSystemMoney = 0;
  const breakdown: any = {
    connectedPlayers: { count: 0, total: 0, players: [] },
    tableSeats: { count: 0, total: 0, seats: [] },
    gameSeats: { count: 0, total: 0, seats: [] },
    cargoChest: { table: 0, game: 0 },
    gamePot: 0,
    aiPlayers: { count: 0, total: 0, players: [] }
  };

  // 1. Check connected players' bankrolls
  for (const [socketId, player] of socketIdToPlayer.entries()) {
    if (!player.isAI) {
      breakdown.connectedPlayers.count++;
      breakdown.connectedPlayers.total += player.bankroll;
      breakdown.connectedPlayers.players.push({
        name: player.name,
        id: socketId,
        bankroll: player.bankroll / 100,
        hasGoogleId: !!player.googleId
      });
      totalSystemMoney += player.bankroll;
    }
  }

  // 2. Check table seats
  tableState.seats.forEach((seat, index) => {
    if (seat && !seat.isAI) {
      breakdown.tableSeats.count++;
      breakdown.tableSeats.total += seat.tableStack;
      breakdown.tableSeats.seats.push({
        index,
        name: seat.name,
        id: seat.id,
        bankroll: seat.tableStack ? seat.tableStack / 100 : 0,
        hasGoogleId: !!seat.googleId
      });
      totalSystemMoney += seat.tableStack || 0;
    }
  });

  // 3. Check game seats (if different from table seats)
  if (gameState) {
    gameState.seats.forEach((seat, index) => {
      if (!seat.isAI) {
        breakdown.gameSeats.count++;
        breakdown.gameSeats.total += seat.tableStack;
        breakdown.gameSeats.seats.push({
          index,
          name: seat.name,
          id: seat.playerId,
          bankroll: seat.tableStack / 100
        });
        // Only add to total if this is different from table seat
        const tableSeat = tableState.seats.find(ts => ts?.id === seat.playerId);
        if (!tableSeat || tableSeat.bankroll !== seat.tableStack) {
          totalSystemMoney += seat.tableStack;
        }
      }
    });
    
    // Game pot
    breakdown.gamePot = gameState.pot || 0;
    totalSystemMoney += (gameState.pot || 0);
    
    // Game cargo chest
    breakdown.cargoChest.game = gameState.cargoChest || 0;
    totalSystemMoney += (gameState.cargoChest || 0);
  }

  // 4. Check AI players array (should not count toward money audit but good to know)
  aiPlayers.forEach(aiPlayer => {
    breakdown.aiPlayers.count++;
    breakdown.aiPlayers.total += aiPlayer.bankroll;
    breakdown.aiPlayers.players.push({
      name: aiPlayer.name,
      id: aiPlayer.id,
      bankroll: aiPlayer.bankroll / 100
    });
  });

  // 5. Table cargo chest
  breakdown.cargoChest.table = tableState.cargoChest || 0;
  totalSystemMoney += (tableState.cargoChest || 0);

  console.log('💰 MONEY AUDIT BREAKDOWN:');
  console.log('Connected Players:', breakdown.connectedPlayers);
  console.log('Table Seats:', breakdown.tableSeats);
  console.log('Game Seats:', breakdown.gameSeats);
  console.log('Game Pot:', breakdown.gamePot / 100, 'dollars');
  console.log('Cargo Chest (Table):', breakdown.cargoChest.table / 100, 'dollars');
  console.log('Cargo Chest (Game):', breakdown.cargoChest.game / 100, 'dollars');
  console.log('AI Players (not counted):', breakdown.aiPlayers);
  console.log(`💰 TOTAL SYSTEM MONEY: ${totalSystemMoney / 100} dollars (${totalSystemMoney} pennies)`);
  console.log('🔍 === MONEY AUDIT END ===');
  
  return { totalSystemMoney, breakdown };
}

function createAIPlayer(): Player {
  try {
    return createAiPlayer(); // Use existing function
  } catch (error) {
    console.error('Error creating AI player:', error);
    // Fallback AI player
    return {
      id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `AI Player ${Date.now()}`,
      isAI: true,
      bankroll: 10000,
      cosmetics: {
        banner: 'classic',
        emblem: 'none',
        title: 'none',
        highSkin: 'bone-classic',
        lowSkin: 'pearl-simple'
      }
    };
  }
}


function endGame(): void {
  // Save cargo chest to table state before clearing game
  if (gameState && gameState.cargoChest !== undefined) {
    tableState.cargoChest = gameState.cargoChest;
    console.log(`💰 Preserving cargo chest: ${tableState.cargoChest} pennies`);
  }
  
  gameState = null;
  // Clear all seated AI players
  const aiPlayers = getAISeatedPlayers();
  aiPlayers.forEach(ai => standUpPlayer(ai.id));
  broadcastGameState();
  broadcastTableState();
}

function autoFillAI(): void {
  try {
    const humanCount = getHumanSeatedPlayers().length;
    const currentAICount = getAISeatedPlayers().length;
    const targetTotal = configService.getConfig().table.targetTotalPlayers;
    
    console.log(`AutoFill: ${humanCount} humans, ${currentAICount} AI, target ${targetTotal}`);
    
    // Only auto-fill if there are humans at the table
    if (humanCount === 0) {
      // Remove all AI if no humans
      const aiPlayers = getAISeatedPlayers();
      aiPlayers.forEach(ai => {
        try {
          standUpPlayer(ai.id);
        } catch (e) {
          console.error('Error removing AI player:', e);
        }
      });
      broadcastTableState();
      return;
    }
    
    // Calculate how many AI players we need
    // Only fill to target if we have enough humans to start the game
    const minHumans = configService.getConfig().table.minHumanPlayers;
    const shouldFillToTarget = humanCount >= minHumans;
    const targetAICount = shouldFillToTarget ? Math.max(0, targetTotal - humanCount) : 0;
    const aiNeeded = targetAICount - currentAICount;
    
    console.log(`AutoFill logic: humans=${humanCount}, minRequired=${minHumans}, shouldFill=${shouldFillToTarget}, targetAI=${targetAICount}`);
    
    if (aiNeeded > 0) {
      // Add AI players
      console.log(`Adding ${aiNeeded} AI players`);
      for (let i = 0; i < aiNeeded; i++) {
        try {
          const aiPlayer = createAIPlayer();
          if (!seatPlayer(aiPlayer)) break; // Stop if table is full
        } catch (e) {
          console.error('Error adding AI player:', e);
          break;
        }
      }
    } else if (aiNeeded < 0) {
      // Remove excess AI players
      const aiToRemove = Math.abs(aiNeeded);
      const aiPlayers = getAISeatedPlayers();
      console.log(`Removing ${aiToRemove} AI players`);
      for (let i = 0; i < aiToRemove && i < aiPlayers.length; i++) {
        try {
          standUpPlayer(aiPlayers[i]!.id);
        } catch (e) {
          console.error('Error removing AI player:', e);
        }
      }
    }
    
    broadcastTableState();
  } catch (error) {
    console.error('Error in autoFillAI:', error);
  }
}

function canStartGame(): boolean {
  const humanCount = getHumanSeatedPlayers().length;
  const totalCount = getSeatedPlayers().length;
  const humanPlayers = getHumanSeatedPlayers().map(p => p.name);
  const allPlayers = getSeatedPlayers().map(p => `${p.name}(${p.isAI ? 'AI' : 'Human'})`);
  
  // If configured for 1 human minimum, allow single player games
  const config = configService.getConfig();
  const minTotalRequired = config.table.minHumanPlayers;
  
  const canStart = humanCount >= config.table.minHumanPlayers && 
                   totalCount >= minTotalRequired;
  
  console.log(`🎮 Can start game? ${canStart} - Human: ${humanCount}/${config.table.minHumanPlayers}, Total: ${totalCount}/${minTotalRequired}`);
  console.log(`🎮 Human players: [${humanPlayers.join(', ')}]`);
  console.log(`🎮 All players: [${allPlayers.join(', ')}]`);
  console.log(`🎮 Current gameState exists: ${!!gameState}`);
  
  return canStart;
}

function checkAndSpinDownAIOnlyGame(): void {
  const humanCount = getHumanSeatedPlayers().length;
  
  if (humanCount === 0 && gameState) {
    // All players are AI, end the game
    console.log('No human players remaining, ending AI-only game');
    endGame();
  }
}

function initializeHandHistory(players: Player[]): void {
  const config = configService.getConfig();
  currentHandHistory = {
    handId: `hand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    
    // Players and initial state
    players: players.map(p => ({
      playerId: p.id,
      name: p.name,
      isAI: p.isAI,
      startingBankroll: p.bankroll,
      endingBankroll: p.bankroll
    })),
    
    // Comprehensive round-by-round tracking
    rounds: [],
    
    
    // Complete table configuration snapshot for debugging
    tableConfig: {
      table: config.table,
      betting: {
        streets: config.betting.streets,
        ante: config.betting.ante,
        edge_tiers: config.betting.edge_tiers,
        dominant_threshold: config.betting.dominant_threshold,
        rounding: config.betting.rounding
      },
      payouts: {
        role_payouts: config.payouts.role_payouts,
        multi_role_allowed: config.payouts.multi_role_allowed,
        combo_kicker: config.payouts.combo_kicker,
        role_requirements: config.payouts.role_requirements
      },
      house: {
        rake_enabled: config.house.rake_enabled,
        rake_percent: config.house.rake_percent
      },
      chest: {
        drip_percent: config.chest.drip_percent,
        carryover: config.chest.carryover,
        unfilled_role_to_chest: config.chest.unfilled_role_to_chest,
        low_rank_triggers: config.chest.low_rank_triggers,
        trigger_tiebreak: config.chest.trigger_tiebreak
      },
      bust_fee: config.bust_fee,
      advanced: config.advanced,
      timing: config.timing,
      display: config.display
    },
    
    // Legacy structure for compatibility
    phases: [],
    pot: 0,
    winners: [],
    cargoChest: 0
  };
  
  console.log(`📊 Hand history initialized: ${currentHandHistory?.handId} with ${players.length} players`);
}

// Helper functions for comprehensive round tracking
function getCurrentRound(): number {
  if (!gameState) return 1;
  const phase = gameState.phase;
  if (phase.includes('1')) return 1;
  if (phase.includes('2')) return 2;
  if (phase.includes('3')) return 3;
  if (phase === 'Roll4') return 4;
  return 1;
}

function ensureRoundExists(roundNumber: number): void {
  if (!currentHandHistory) return;
  
  // Find existing round or create new one
  let round = currentHandHistory.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) {
    round = {
      roundNumber,
      rollPhase: {
        diceAfterRoll: [],
        playerDice: {}
      }
    };
    currentHandHistory.rounds.push(round);
  }
}

function recordRollPhase(): void {
  if (!gameState || !currentHandHistory) return;
  
  const roundNumber = getCurrentRound();
  ensureRoundExists(roundNumber);
  
  const round = currentHandHistory.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return;
  
  // Record dice state for each player after rolling
  round.rollPhase.playerDice = {};
  for (const seat of gameState.seats) {
    round.rollPhase.playerDice[seat.playerId] = seat.dice.map(d => d.value || 0);
  }
  
  console.log(`📊 Recorded Roll${roundNumber} phase with ${gameState.seats.length} players`);
}

function recordLockPhase(): void {
  if (!gameState || !currentHandHistory) return;
  
  const roundNumber = getCurrentRound();
  const round = currentHandHistory.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return;
  
  // Initialize lock phase if needed
  if (!round.lockPhase) {
    round.lockPhase = {
      locks: {},
      publicDice: {},
      privateDice: {}
    };
  }
  
  // Record lock state for each player
  for (const seat of gameState.seats) {
    const locked = seat.dice.filter(d => d.locked).map(d => d.value || 0);
    const publicDice = seat.dice.filter(d => d.locked && d.isPublic).map(d => d.value || 0);
    const privateDice = seat.dice.filter(d => d.locked && !d.isPublic).map(d => d.value || 0);
    
    round.lockPhase.locks[seat.playerId] = locked;
    round.lockPhase.publicDice[seat.playerId] = publicDice;
    round.lockPhase.privateDice[seat.playerId] = privateDice;
  }
  
  console.log(`📊 Recorded Lock${roundNumber} phase`);
}

function recordBetAction(playerId: string, action: string, amount?: number): void {
  if (!gameState || !currentHandHistory) return;
  
  const roundNumber = getCurrentRound();
  const round = currentHandHistory.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return;
  
  // Initialize betting phase if needed
  if (!round.bettingPhase) {
    round.bettingPhase = {
      actions: [],
      potAtEnd: 0
    };
  }
  
  const player = gameState.seats.find(s => s.playerId === playerId);
  round.bettingPhase.actions.push({
    playerId,
    playerName: player?.name || 'Unknown',
    action: action as any,
    amount: amount || 0,
    timestamp: new Date().toISOString()
  });
  
  // Update pot total
  const totalContributions = gameState.seats.reduce((sum, s) => sum + (s.totalContribution || 0), 0);
  round.bettingPhase.potAtEnd = totalContributions;
  
  console.log(`📊 Recorded betting action: ${player?.name} ${action} ${amount || 0}`);

  // Real-time cross-reference validation
  if (currentHandHistory && gameState) {
    const discrepancies = crossReferenceService.validateCurrentHand(currentHandHistory, gameState);
    if (discrepancies.length > 0) {
      const highSeverityDiscrepancies = discrepancies.filter(d => ['high', 'critical'].includes(d.severity));
      if (highSeverityDiscrepancies.length > 0) {
        logger.log('warn', 'game', `High severity discrepancies detected in hand ${currentHandHistory.handId}`, {
          handId: currentHandHistory.handId,
          phase: gameState.phase,
          discrepancies: highSeverityDiscrepancies
        });
      }
    }
  }
}

function recordShowdown(): void {
  if (!gameState || !currentHandHistory) return;
  
  // Initialize showdown details
  currentHandHistory.showdown = {
    finalHands: {},
    payouts: {}
  };
  
  // Record final hands and roles for each player
  for (const seat of gameState.seats) {
    if (!seat.hasFolded) {
      // Find this player's showdown result to get their role
      const result = gameState.showdownResults?.find(r => r.playerId === seat.playerId);
      const role = result?.roles?.join(', ') || '';
      
      currentHandHistory.showdown.finalHands[seat.playerId] = {
        dice: seat.dice.map(d => d.value || 0),
        role: role,
        rankScore: 0 // TODO: Calculate actual rank score
      };
    }
  }
  
  // Record payouts (will be updated when payouts are calculated)
  for (const seat of gameState.seats) {
    currentHandHistory.showdown.payouts[seat.playerId] = 0; // Will be updated with actual payouts
  }
  
  console.log(`📊 Recorded showdown with ${Object.keys(currentHandHistory.showdown.finalHands).length} final hands`);
}

function startNewHand(): void {
  console.log(`🎲 startNewHand() called`);
  
  // Apply pending config changes before starting the new hand
  if (pendingConfigChanges) {
    console.log('📝 Applying deferred config changes before new hand');
    try {
      configService.updateConfig(pendingConfigChanges);
      logger.log('info', 'system', 'Applied deferred config changes', { pendingConfigChanges });
      pendingConfigChanges = null;
    } catch (error) {
      logger.log('error', 'system', 'Failed to apply deferred config changes', { error });
      pendingConfigChanges = null;
    }
  }
  
  const players = getSeatedPlayers();
  console.log(`🎲 Found ${players.length} seated players:`, players.map(p => `${p.name}(${p.isAI ? 'AI' : 'Human'})`));

  // Auto-stand players with insufficient table stack before starting hand
  const minimumTableStack = calculateMinimumTableStack();
  const playersToStand: string[] = [];

  for (const player of players) {
    if (!player.isAI && player.tableStack && player.tableStack < minimumTableStack) {
      console.log(`💸 Player ${player.name} has insufficient table stack: $${player.tableStack / 100} < $${minimumTableStack / 100} (minimum)`);
      playersToStand.push(player.id);
    }
  }

  // Stand up players with insufficient funds
  if (playersToStand.length > 0) {
    console.log(`🚪 Auto-standing ${playersToStand.length} players due to insufficient table stack`);
    for (const playerId of playersToStand) {
      const player = players.find(p => p.id === playerId);
      if (player) {
        console.log(`🚪 Auto-standing ${player.name} (table stack: $${(player.tableStack || 0) / 100}, minimum: $${minimumTableStack / 100})`);
        standUpPlayer(playerId);

        // Notify the player
        const socketId = Array.from(socketIdToPlayer.entries()).find(([_, p]) => p.id === playerId)?.[0];
        if (socketId) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('auto_stand_insufficient_funds', {
              message: `You were automatically stood up due to insufficient table stack. Minimum required: $${(minimumTableStack / 100).toFixed(2)}`,
              minimumRequired: minimumTableStack / 100,
              yourTableStack: (player.tableStack || 0) / 100
            });
          }
        }
      }
    }

    // Update table and lobby states after standing players
    broadcastTableState();
    broadcastLobbyState();
  }

  // Re-get seated players after potential auto-standing
  const finalPlayers = getSeatedPlayers();
  console.log(`🎲 Final seated players after auto-stand check: ${finalPlayers.length}`, finalPlayers.map(p => `${p.name}(${p.isAI ? 'AI' : 'Human'})`));

  // Check if we can start
  if (!canStartGame()) {
    console.log('❌ Cannot start game: not enough human players or total players');
    return;
  }
  
  console.log(`✅ Game can start! Creating game state...`);
  
  if (gameState && gameState.phase !== 'Lobby' && gameState.phase !== 'HandEnd') {
    // If game is in progress but we don't have hand history, initialize it
    if (!currentHandHistory) {
      console.log('Game in progress but missing hand history - initializing tracking only');
      initializeHandHistory(finalPlayers);
    } else {
      console.log('Game already in progress');
    }
    return;
  }

  // Initialize comprehensive hand history for this hand
  initializeHandHistory(finalPlayers);

  console.log(`Starting new hand with ${finalPlayers.length} players`);
  console.log('🎲 Seats being created:', finalPlayers.map(p => `${p.name}(${p.isAI ? 'AI' : 'Human'}, tableStack: $${(p.tableStack || 0)/100})`));
  
  gameState = {
    phase: 'Ante',
    seats: finalPlayers.map((p) => ({
      playerId: p.id,
      name: p.name,
      isAI: p.isAI,
      tableStack: p.tableStack || 0,
      dice: createEmptyDiceSet(),
      hasFolded: false,
      lockAllowance: 0,
      lockingDone: false,
      currentBet: 0,
      hasActed: false,
      aiProfile: p.isAI ? assignAIProfile() : undefined,
      cosmetics: p.cosmetics || {
        banner: 'classic',
        emblem: 'none',
        title: 'none',
        highSkin: 'bone-classic',
        lowSkin: 'pearl-simple'
      }
    })),
    pot: 0,
    currentBet: 0,
    ante: calculateAnteAmount('Ante'),
    cargoChest: gameState?.cargoChest || 0,
    dripAccumulator: gameState?.dripAccumulator || 0,
    totalDavyJonesRake: gameState?.totalDavyJonesRake || 0
  };
  
  onEnterPhase();
  broadcastGameState();
}

// Custom Skin API endpoints
app.get('/api/skins/custom/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Now TypeScript knows userId is definitely a string
    const customSkins = await prisma.customSkin.findMany({
      where: { userId: userId as string },
      orderBy: { createdAt: 'desc' }
    });

    res.json(customSkins.map(skin => ({
      id: skin.skinId,
      name: skin.name,
      combo: JSON.parse(skin.comboData),
      complexity: skin.complexity,
      rarity: skin.rarity,
      isPublic: skin.isPublic,
      createdAt: skin.createdAt,
      updatedAt: skin.updatedAt
    })));
  } catch (error) {
    console.error('Error fetching custom skins:', error);
    res.status(500).json({ error: 'Failed to fetch custom skins' });
  }
});

app.post('/api/skins/custom', async (req: Request, res: Response) => {
  console.log('🎲 [API] POST /api/skins/custom - Request received');

  try {
    const { userId, userName, skinId, name, combo, complexity, rarity, isPublic = false } = req.body;

    console.log('📦 [API] Request data:', {
      userId,
      userName,
      skinId,
      name,
      complexity,
      rarity,
      isPublic,
      hasCombo: !!combo
    });

    if (!userId || !userName || !skinId || !name || !combo) {
      console.log('❌ [API] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('💾 [API] Attempting database upsert...');

    // Use upsert to create or update existing skin with same userId + skinId
    const customSkin = await prisma.customSkin.upsert({
      where: {
        userId_skinId: {
          userId,
          skinId
        }
      },
      update: {
        name,
        comboData: JSON.stringify(combo),
        complexity,
        rarity,
        isPublic,
        updatedAt: new Date()
      },
      create: {
        userId,
        userName,
        skinId,
        name,
        comboData: JSON.stringify(combo),
        complexity,
        rarity,
        isPublic
      }
    });

    console.log('✅ [API] Database operation successful:', {
      id: customSkin.id,
      skinId: customSkin.skinId,
      name: customSkin.name,
      createdAt: customSkin.createdAt,
      updatedAt: customSkin.updatedAt
    });

    const responseData = {
      id: customSkin.skinId,
      name: customSkin.name,
      combo: JSON.parse(customSkin.comboData),
      complexity: customSkin.complexity,
      rarity: customSkin.rarity,
      isPublic: customSkin.isPublic,
      createdAt: customSkin.createdAt,
      updatedAt: customSkin.updatedAt
    };

    console.log('📤 [API] Sending response:', {
      ...responseData,
      combo: '(dice combo data)'
    });

    res.json(responseData);
  } catch (error) {
    console.error('💥 [API] Error saving custom skin:', error);
    res.status(500).json({ error: 'Failed to save custom skin' });
  }
});

app.delete('/api/skins/custom/:userId/:skinId', async (req: Request, res: Response) => {
  try {
    const { userId, skinId } = req.params as { userId: string; skinId: string };

    if (!userId || !skinId) {
      return res.status(400).json({ error: 'User ID and Skin ID are required' });
    }

    await prisma.customSkin.delete({
      where: {
        userId_skinId: {
          userId,
          skinId
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom skin:', error);
    res.status(500).json({ error: 'Failed to delete custom skin' });
  }
});

// TODO: Multi-game support - disabled for PiratePlunder standalone package
// Placeholder variables to allow code to compile - these features are disabled
const socketGameType = new Map<string, GameType>();
const warfaireGame: any = null;
const houserulesGame: any = null;
const warfairePlayers = new Map<string, { id: string; name: string; bankroll: number; isAI: boolean; googleId?: string }>();
const flipzPlayers = new Map<string, { id: string; name: string; bankroll: number; isAI: boolean; googleId?: string; tableId?: string }>();
const houserulesPlayers = new Map<string, { id: string; name: string; bankroll: number; isAI: boolean; googleId?: string }>();
const playerTableMap = new Map<string, string>(); // playerId -> tableId
const flipzTables = new Map<string, any>();
const FLIPZ_TABLES: any[] = [];
const pokerTableManager: any = null;
const WarFaireGame: any = null;

// Register game types with the registry
// gameRegistry.registerGameType('coin-flip', CoinFlipGame as any);
// gameRegistry.registerGameType('card-flip', CardFlipGame as any);
// gameRegistry.registerGameType('warfaire', WarFaireGame as any);
// gameRegistry.registerGameType('houserules-poker', HouseRules as any);

// Initialize Flipz tables (multiple instances)
// const flipzTables = new Map<string, any>(); // tableId -> game instance
// console.log('🪙 Initializing Flipz tables...');
// for (const tableConfig of FLIPZ_TABLES) {
//   const gameClass = tableConfig.variant === 'coin-flip' ? CoinFlipGame : CardFlipGame;
//   const rakePercentage = tableConfig.rakePercentage ?? 5;
//   const minBuyInMultiplier = tableConfig.minBuyInMultiplier ?? 5;
//   const gameInstance = new gameClass({
//     minHumanPlayers: 1,
//     targetTotalPlayers: 2,
//     maxSeats: tableConfig.maxSeats,
//     betting: {
//       ante: {
//         mode: 'fixed',
//         amount: tableConfig.ante,
//       },
//     },
//     rakePercentage,
//     minBuyInMultiplier,
//   });
//   flipzTables.set(tableConfig.tableId, gameInstance);
//   console.log(`  ✅ ${tableConfig.displayName} (${tableConfig.tableId}) - Rake: ${rakePercentage}%, Min Buy-in: ${minBuyInMultiplier}x ante`);
// }

// Initialize WarFaire game
// const warfaireGame = gameRegistry.getOrCreateDefaultGame('warfaire');
// console.log('🎪 WarFaire game initialized:', warfaireGame ? 'success' : 'failed');

// Initialize HouseRules Poker multi-table system
// const pokerRegistry = new TableRegistry();
// const pokerTableManager = new TableManager(pokerRegistry);

// Create default poker tables
// console.log('♠️ Initializing HouseRules Poker tables...');
// const defaultPokerTables = [
//   {
//     tableId: 'holdem-1',
//     displayName: 'Classic Hold\'em Table 1',
//     variant: 'holdem' as const,
//     rules: {},
//     minBuyIn: 1000, // $10
//     maxBuyIn: 10000, // $100
//     smallBlind: 50, // $0.50
//     bigBlind: 100, // $1
//     maxSeats: 8,
//     emoji: '♠️',
//     description: 'Classic Texas Hold\'em',
//     currentPlayers: 0,
//     isActive: true
//   },
//   {
//     tableId: 'squidz-1',
//     displayName: 'Squidz Game Table 1',
//     variant: 'squidz-game' as const,
//     rules: {},
//     minBuyIn: 5000, // $50
//     maxBuyIn: 20000, // $200
//     smallBlind: 100, // $1
//     bigBlind: 200, // $2
//     maxSeats: 6,
//     emoji: '🦑',
//     description: 'Squidz Game - High Stakes',
//     currentPlayers: 0,
//     isActive: true,
//     squidValue: 500 // $5
//   }
// ];

// defaultPokerTables.forEach(tableConfig => {
//   pokerRegistry.addTable(tableConfig as any);
//   console.log(`  ✅ ${tableConfig.displayName} (${tableConfig.tableId})`);
// });

// Keep the legacy single instance for backward compatibility (will be deprecated)
// const houserulesGame = gameRegistry.getOrCreateDefaultGame('houserules-poker');
// console.log('♠️ HouseRules Poker tables initialized');

// Generic SDK Game Router - consolidates game-specific logic
interface SDKGameConfig {
  gameInstance: any;
  playerMap: Map<string, any>;
  defaultBuyIn: number; // in pennies
  botNamePrefix: string;
  emoji: string;
}

// Build SDK game configs dynamically from game metadata
// Platform owns: gameInstance, playerMap
// Games own: defaultBuyIn, botNamePrefix, emoji (via getMetadata())
const warfaireMetadata = warfaireGame?.getMetadata() || { emoji: '🎪', botNamePrefix: 'WarBot', defaultBuyIn: 0 };
const houserulesMetadata = houserulesGame?.getMetadata() || { emoji: '♠️', botNamePrefix: 'PokerBot', defaultBuyIn: 5000 };

const sdkGameConfigs: Record<string, SDKGameConfig> = {
  'warfaire': {
    gameInstance: warfaireGame!,
    playerMap: warfairePlayers,
    ...warfaireMetadata
  },
  'houserules-poker': {
    gameInstance: houserulesGame!,
    playerMap: houserulesPlayers,
    ...houserulesMetadata
  }
};

// Helper: Get SDK game config for a socket
function getSDKGame(socketId: string): SDKGameConfig | null {
  const gameType = socketGameType.get(socketId);
  if (!gameType) return null;
  return sdkGameConfigs[gameType] || null;
}

io.on('connection', (socket) => {
  gameDebugger.logEvent('connection', socket.id);
  logger.logSocketEvent(socket.id, 'Client connected');
  
  // Client should send { name: string, cosmetics?: PlayerCosmetics, bankroll?: number, gameType?: GameType }
  socket.on('join', async (payload: { name?: string; cosmetics?: PlayerCosmetics; bankroll?: number; gameType?: GameType }) => {
    gameDebugger.logEvent('join', socket.id, payload);
    logger.logSocketEvent(socket.id, 'Player joining', payload);
    console.log(`🔌 SOCKET JOIN: ${socket.id} joining as "${payload.name}" for game type: ${payload.gameType || 'pirate-plunder'}`);
    console.log(`🔌 Current socketIdToPlayer size: ${socketIdToPlayer.size}`);
    console.log(`🔌 Current table seats: ${tableState.seats.filter(s => s).length} seated`);

    // Set game type from payload (defaults to pirate-plunder if not specified)
    if (payload.gameType) {
      socketGameType.set(socket.id, payload.gameType);
      console.log(`🎮 Socket ${socket.id} set to game type: ${payload.gameType}`);

      // Register player with the appropriate game
      const playerInfo = {
        id: socket.id,
        name: payload.name || `Player-${socket.id.slice(0, 4)}`,
        bankroll: payload.bankroll || 10000,
        isAI: false
      };

      // Register with SDK game if configured
      const sdkGame = sdkGameConfigs[payload.gameType];
      if (sdkGame) {
        sdkGame.playerMap.set(socket.id, playerInfo);
        console.log(`${sdkGame.emoji} Registered ${playerInfo.name} with ${payload.gameType} game`);
      } else if (payload.gameType === 'flipz') {
        flipzPlayers.set(socket.id, playerInfo);
        console.log(`🪙 Registered ${playerInfo.name} with Flipz lobby (no table selected yet)`);
      }
    }

    // Note: We don't route join differently - all players go through standard connection flow
    // The sit_down/stand_up/player_action events will route to appropriate game based on socketGameType
    
    // Check if user is admin from session and get user data
    let isAdmin = false;
    let userGoogleId: string | undefined;
    try {
      const session = (socket.request as any).session;
      if (session?.passport?.user) {
        const result = await pgPool.query('SELECT "isAdmin", "googleId" FROM users WHERE id = $1', [session.passport.user]);
        isAdmin = result.rows[0]?.isAdmin || false;
        userGoogleId = result.rows[0]?.googleId;

        // Check for game-specific permissions if not a global admin
        const playerGameType = socketGameType.get(socket.id);
        if (!isAdmin && userGoogleId && playerGameType) {
          const permResult = await pgPool.query(
            'SELECT role FROM user_game_permissions WHERE userid = $1 AND gametype = $2',
            [userGoogleId, playerGameType]
          );
          if (permResult.rows.length > 0 && permResult.rows[0].role === 'admin') {
            isAdmin = true;
            console.log(`🎮 Granting ${playerGameType} admin permissions to ${result.rows[0]?.name || 'user'} via game-specific permission`);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to check admin status:', error);
    }

    // Check if this user is reconnecting to an existing seat
    let existingSeat = null;
    console.log(`🔌 Checking reconnection for googleId: ${userGoogleId}`);
    if (userGoogleId && tableState) {
      existingSeat = tableState.seats.find(seat => seat && seat.googleId === userGoogleId);
      console.log(`🔌 Found table seat for reconnection:`, existingSeat ? `${existingSeat.name} at index ${tableState.seats.indexOf(existingSeat)}` : 'none');
    }
    if (userGoogleId && gameState) {
      const gameSeat = gameState.seats.find(seat => seat && seat.playerId && socketIdToPlayer.get(seat.playerId)?.googleId === userGoogleId);
      if (gameSeat) {
        existingSeat = gameSeat;
        console.log(`🔌 Found game seat for reconnection:`, `${gameSeat.name} with playerId ${gameSeat.playerId}`);
      } else {
        // Also check for seats with matching name (including disconnected ones)
        const playerName = (payload && payload.name) || `Player-${socket.id.slice(0, 4)}`;
        const disconnectedSeat = gameState.seats.find(seat => seat && seat.name && (
          seat.name.startsWith(playerName) || seat.name.includes(playerName)
        ));
        if (disconnectedSeat) {
          console.log(`🔌 Found potential disconnected seat:`, `${disconnectedSeat.name} with playerId ${disconnectedSeat.playerId}`);
          existingSeat = disconnectedSeat;
        }
      }
    }
    console.log(`🔌 Final existingSeat:`, existingSeat ? existingSeat.name : 'none');

    const player: Player = {
      id: socket.id,
      name: (payload && payload.name) || `Player-${socket.id.slice(0, 4)}`,
      isAI: false,
      bankroll: payload.bankroll || 10000, // Use real bankroll from user profile
      ...(userGoogleId && { googleId: userGoogleId }), // For database persistence
      cosmetics: payload.cosmetics || {
        banner: 'classic',
        emblem: 'none',
        title: 'none',
        highSkin: 'bone-classic',
        lowSkin: 'pearl-simple'
      }
    };
    
    // Handle reconnection to existing seat (table or game state)
    let reconnectedToExistingSeat = false;
    
    // Check for existing table seat first
    if (userGoogleId && tableState) {
      const tableSeat = tableState.seats.find(seat => seat && seat.googleId === userGoogleId);
      if (tableSeat && !tableSeat.isAI) {
        const oldPlayerId = tableSeat.id;
        tableSeat.id = socket.id;
        tableSeat.name = player.name; // Remove "(disconnected)" suffix if present
        reconnectedToExistingSeat = true;
        console.log(`🔄 Player ${player.name} reconnected to table seat (was ${oldPlayerId}, now ${socket.id})`);
      }
    }
    
    // Check for existing game seat - look for seats belonging to this googleId
    if (userGoogleId && gameState) {
      console.log(`🔍 Looking for game seat with googleId: ${userGoogleId}`);
      console.log(`🔍 Current game seats:`, gameState.seats.map(s => `${s.name}(playerId: ${s.playerId}, isAI: ${s.isAI})`));
      
      // Try to find seat by googleId stored in socketIdToPlayer first
      let gameSeat = gameState.seats.find(seat => seat && socketIdToPlayer.get(seat.playerId)?.googleId === userGoogleId);
      
      // If not found, try to find by matching name (fallback for when socketIdToPlayer is cleared)
      if (!gameSeat && !reconnectedToExistingSeat) {
        console.log(`🔍 Fallback: looking for seat with name "${player.name}"`);
        gameSeat = gameState.seats.find(seat => seat && !seat.isAI && (
          seat.name === player.name || 
          seat.name === `${player.name} (disconnected)` ||
          seat.name.startsWith(player.name)
        ));
      }
      
      if (gameSeat && !gameSeat.isAI) {
        const oldPlayerId = gameSeat.playerId;
        gameSeat.playerId = socket.id;
        // Explicitly remove "(disconnected)" suffix and restore clean name
        const oldSeatName = gameSeat.name;
        const cleanName = player.name.replace(' (disconnected)', '');
        gameSeat.name = cleanName;
        console.log(`🔄 Restoring seat name: "${oldSeatName}" -> "${cleanName}"`);
        
        // Update currentTurnPlayerId if it was their turn
        const wasTheirTurn = gameState.currentTurnPlayerId === oldPlayerId;
        if (wasTheirTurn) {
          console.log(`🔄 Updating currentTurnPlayerId from ${oldPlayerId?.slice(0,6)} to ${socket.id.slice(0,6)}`);
          gameState.currentTurnPlayerId = socket.id;
        }
        
        // Give them a chance to rejoin if they reconnect quickly
        if (gameSeat.hasFolded) {
          // Check if they were disconnected and had pending timeouts (meaning they weren't supposed to be folded yet)
          const wasDisconnected = disconnectedPlayers.has(oldPlayerId) || disconnectedPlayers.has(socket.id);
          const isBettingPhase = gameState.phase.includes('Bet');
          const isTheirTurn = wasTheirTurn || gameState.currentTurnPlayerId === socket.id;
          
          if (wasDisconnected || isTheirTurn) {
            console.log(`♻️ Unfolding ${player.name} - reconnected during ${gameState.phase} (was disconnected: ${wasDisconnected}, their turn: ${isTheirTurn})`);
            gameSeat.hasFolded = false;
            gameSeat.hasActed = false; // Reset action state to allow them to act
            
            // If it's a betting phase and they were the current turn player, ensure turn assignment
            if (gameState.phase.includes('Bet') && isTheirTurn) {
              console.log(`🎯 Ensuring ${player.name} is current turn player after reconnection`);
              gameState.currentTurnPlayerId = socket.id;
            }
          }
        }
        
        // Check if they should be the current turn player in a betting phase
        if (gameState && gameState.phase.includes('Bet') && !gameSeat.hasFolded) {
          const currentTurnPlayer = gameState.seats.find(s => s && s.playerId === gameState!.currentTurnPlayerId);
          if (!currentTurnPlayer || currentTurnPlayer.hasFolded || currentTurnPlayer.isAI === undefined) {
            // Current turn player is invalid, check if this reconnected player should have the turn
            const activePlayers = gameState.seats.filter(s => !s.hasFolded && !s.isAllIn);
            const needsToAct = activePlayers.find(s => 
              !s.hasActed || (gameState!.currentBet > (s.currentBet || 0))
            );
            if (needsToAct && needsToAct.playerId === socket.id) {
              console.log(`🎯 Assigning turn to reconnected player ${player.name} who needs to act`);
              gameState.currentTurnPlayerId = socket.id;
            }
          }
        }
        
        reconnectedToExistingSeat = true;
        console.log(`🎮 Player ${player.name} reconnected to game seat (was ${oldPlayerId}, now ${socket.id}), folded: ${gameSeat.hasFolded}`);
        console.log(`🔍 Updated seat details:`, { name: gameSeat.name, playerId: gameSeat.playerId, hasFolded: gameSeat.hasFolded });
      } else {
        console.log(`🔍 No game seat found for ${player.name} (googleId: ${userGoogleId})`);
      }
    }

    // Check for existing WarFaire game seat
    if (userGoogleId && warfaireGame && !reconnectedToExistingSeat) {
      const warfaireState = warfaireGame.getGameState();
      if (warfaireState && warfaireState.seats) {
        console.log(`🎪 Looking for WarFaire game seat with googleId: ${userGoogleId}`);
        console.log(`🎪 Current WarFaire seats:`, warfaireState.seats.map((s: any) => s ? `${s.name}(playerId: ${s.playerId}, isAI: ${s.isAI})` : 'empty'));

        // Try to find seat by googleId stored in warfairePlayers first
        let warfaireSeat = warfaireState.seats.find((seat: any) => seat && warfairePlayers.get(seat.playerId)?.googleId === userGoogleId);

        // If not found, try to find by matching name (fallback for when warfairePlayers is cleared)
        if (!warfaireSeat) {
          console.log(`🎪 Fallback: looking for WarFaire seat with name "${player.name}"`);
          warfaireSeat = warfaireState.seats.find((seat: any) => seat && !seat.isAI && (
            seat.name === player.name ||
            seat.name === `${player.name} (disconnected)` ||
            seat.name.startsWith(player.name)
          ));
        }

        if (warfaireSeat && !warfaireSeat.isAI) {
          const oldPlayerId = warfaireSeat.playerId;
          warfaireSeat.playerId = socket.id;
          // Explicitly remove "(disconnected)" suffix and restore clean name
          const oldSeatName = warfaireSeat.name;
          warfaireSeat.name = player.name;

          // Re-register player with WarFaire game
          warfairePlayers.set(socket.id, {
            id: socket.id,
            name: player.name,
            bankroll: player.bankroll,
            isAI: false,
            googleId: userGoogleId
          });

          // CRITICAL: Unregister old socket before registering new one
          warfaireGame.unregisterSocket(oldPlayerId);
          console.log(`🎪 Unregister old socket ${oldPlayerId.slice(0, 6)}`);

          // Disconnect the old socket at Socket.IO level to prevent it from sending messages
          const oldSocket = io.sockets.sockets.get(oldPlayerId);
          if (oldSocket && oldSocket.id !== socket.id) {
            oldSocket.disconnect(true);
            console.log(`🎪 Disconnected old socket ${oldPlayerId.slice(0, 6)} at Socket.IO level`);
          }

          // Register new socket with game so broadcasts reach this player
          warfaireGame.registerSocket(socket, player);
          console.log(`🎪 Re-registered socket for ${player.name} with WarFaire game`);

          reconnectedToExistingSeat = true;
          console.log(`🎪 Player ${player.name} reconnected to WarFaire game seat (was ${oldPlayerId}, now ${socket.id})`);
          console.log(`🎪 Restored seat: ${oldSeatName} → ${warfaireSeat.name}`);

          // Use game's broadcast method instead of direct io.emit
          (warfaireGame as any).broadcastGameState();
        } else {
          console.log(`🎪 No WarFaire game seat found for ${player.name} (googleId: ${userGoogleId})`);
        }
      }
    }

    if (reconnectedToExistingSeat) {
      console.log(`✅ Successfully reconnected ${player.name} to existing seat`);
      
      // Clear any pending disconnection timeouts
      clearDisconnectionTimeouts(socket.id);
      
      // Also clear timeouts for any previous socket IDs associated with this player
      for (const [playerId, disconnectedPlayer] of disconnectedPlayers.entries()) {
        if (disconnectedPlayer.player.googleId === userGoogleId || disconnectedPlayer.player.name === player.name) {
          console.log(`🔄 Clearing old disconnection timeouts for ${disconnectedPlayer.player.name} (${playerId})`);
          clearDisconnectionTimeouts(playerId);
        }
      }
      
      // Check if turn advancement is needed after reconnection
      if (gameState && gameState.phase.includes('Bet')) {
        const currentTurnPlayer = gameState.seats.find(s => s && s.playerId === gameState!.currentTurnPlayerId);
        console.log(`🔍 Reconnection turn check: currentTurnPlayerId=${gameState!.currentTurnPlayerId?.slice(0,6)}, found player: ${currentTurnPlayer ? currentTurnPlayer.name : 'NONE'}, folded: ${currentTurnPlayer?.hasFolded}`);
        
        if (!currentTurnPlayer || currentTurnPlayer.hasFolded) {
          console.log(`🔄 Current turn player invalid after reconnection, calling advanceTurn()`);
          advanceTurn();
          console.log(`🔄 After advanceTurn: currentTurnPlayerId=${gameState!.currentTurnPlayerId?.slice(0,6)}`);
        }
      }
    }
    // Register player with new durable ID system
    registerPlayerConnection(socket, player);
    
    // Convert existing game state to use durable IDs (one-time migration)
    updateGameStateWithDurableIds();
    
    gameDebugger.addConnection(socket.id, player);
    socket.emit('joined', { player, isAdmin });
    
    // Send initial table state
    broadcastTableState();
    broadcastLobbyState();
    
    // Send current game state if there's an active game
    // Route to appropriate game based on gameType
    const playerGameType = socketGameType.get(socket.id);

    // Try SDK games first (generic routing)
    const sdkGame = playerGameType ? sdkGameConfigs[playerGameType] : null;
    if (sdkGame) {
      // Try to reconnect to existing seat using SDK method
      if (userGoogleId) {
        const reconnected = sdkGame.gameInstance.reconnectPlayer(socket, { ...player, googleId: userGoogleId });
        if (reconnected) {
          console.log(`🔄 ${sdkGame.emoji} ${player.name} reconnected via SDK`);
          // Update player in map
          sdkGame.playerMap.set(socket.id, { ...player, googleId: userGoogleId });
        }
      }

      // Send game state
      const gameState = sdkGame.gameInstance.getGameState();
      socket.emit('game_state', gameState);
      console.log(`📡 ${sdkGame.emoji} Sent game state to ${player.name}`);
    } else if (playerGameType === 'flipz') {
      // Try to reconnect to existing seat in any Flipz table
      if (userGoogleId) {
        for (const [tableId, game] of flipzTables.entries()) {
          const reconnected = game.reconnectPlayer(socket, { ...player, googleId: userGoogleId });
          if (reconnected) {
            console.log(`🔄 Flipz: ${player.name} reconnected to table ${tableId} via SDK`);
            // Update player in map with tableId
            flipzPlayers.set(socket.id, { ...player, googleId: userGoogleId, tableId });
            playerTableMap.set(socket.id, tableId);

            // Send game state for this specific table
            const gameState = game.getGameState();
            socket.emit('game_state', gameState);
            console.log(`📡 Sent Flipz game state (${tableId}) to ${player.name}`);
            break;
          }
        }
      }

      // Send available tables list
      const tablesData = FLIPZ_TABLES.map(tc => ({
        ...tc,
        currentPlayers: flipzTables.get(tc.tableId)?.getGameState()?.seats.filter((s: any) => s !== null).length || 0,
      }));
      socket.emit('flipz_tables', tablesData);
      console.log(`📋 Sent Flipz tables list to ${player.name}`);
    } else if (gameState) {
      // Send Pirate Plunder game state (default)
      let myGameSeat = gameState.seats.find(s => s && s.playerId === socket.id);

      // ADDITIONAL FIX: If seat not found by socket ID but found by name, update the socket ID
      if (!myGameSeat && player.name) {
        const nameMatchedSeat = gameState.seats.find(s => s && s.name &&
          (s.name === player.name || s.name.includes(player.name) || s.name.startsWith(player.name))
        );
        if (nameMatchedSeat && !nameMatchedSeat.isAI) {
          console.log(`🔄 IMMEDIATE FIX: Found seat by name but not by socket ID. Updating ${player.name} from ${nameMatchedSeat.playerId} to ${socket.id}`);
          nameMatchedSeat.playerId = socket.id;
          // Also clean up the name if it has "(disconnected)" suffix
          const cleanName = player.name.replace(' (disconnected)', '');
          nameMatchedSeat.name = cleanName;
          myGameSeat = nameMatchedSeat;

          // Broadcast the updated game state immediately
          setTimeout(() => {
            console.log(`📡 Broadcasting updated game state after socket ID fix`);
            broadcastGameState();
          }, 100);
        }
      }

      socket.emit('game_state', gameState);
      console.log(`Sent current game state to reconnecting player ${player.name}`);
      console.log(`🔍 Game state sent - my seat in game:`, myGameSeat ? `${myGameSeat.name} (playerId: ${myGameSeat.playerId})` : 'NOT FOUND');
    }
    
    // Don't auto-fill AI immediately, let players sit first
  });

  // HouseRules Poker lobby event handlers
  socket.on('poker:get_tables', () => {
    console.log('♠️ Client requesting poker tables list');
    const tables = pokerTableManager.getActiveTables();
    socket.emit('poker_tables', tables);
    console.log(`♠️ Sent ${tables.length} poker tables to client`);
  });

  socket.on('poker:create_table', (config: any) => {
    console.log('♠️ Client creating poker table:', config);
    try {
      const tableId = pokerTableManager.createDynamicTable({
        variant: config.variant,
        displayName: config.displayName,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        ante: config.ante || 0,
        minBuyIn: config.minBuyIn,
        maxBuyIn: config.maxBuyIn,
        maxSeats: config.maxSeats,
        squidValue: config.squidValue
      });
      socket.emit('poker_table_created', { tableId });
      console.log(`♠️ Created poker table: ${tableId}`);

      // Broadcast updated tables list to all poker players
      const tables = pokerTableManager.getActiveTables();
      io.emit('poker_tables', tables);
    } catch (error) {
      console.error('♠️ Error creating poker table:', error);
      socket.emit('error', { message: 'Failed to create table' });
    }
  });

  socket.on('poker:sit_down', async (payload: { tableId: string; seatIndex?: number; buyInAmount: number }) => {
    console.log('♠️ Player sitting down at poker table:', payload);
    try {
      const player = socketIdToPlayer.get(socket.id);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      const result = pokerTableManager.routePlayerToTable(
        player,
        payload.tableId,
        payload.seatIndex,
        payload.buyInAmount
      );

      if (result.success) {
        console.log(`♠️ ${player.name} sat down at ${payload.tableId} in seat ${result.seatIndex}`);

        // Get the table and broadcast its state
        const table = pokerTableManager.getTable(payload.tableId);
        if (table) {
          const gameState = table.getGameState();
          socket.emit('game_state', gameState);

          // Broadcast to all players at this table
          // TODO: Implement room-based broadcasting for multi-table support
          io.emit('game_state', gameState);
        }

        // Broadcast updated tables list
        const tables = pokerTableManager.getActiveTables();
        io.emit('poker_tables', tables);
      } else {
        socket.emit('error', { message: result.error || 'Failed to sit down' });
      }
    } catch (error) {
      console.error('♠️ Error sitting down at poker table:', error);
      socket.emit('error', { message: 'Failed to sit down' });
    }
  });

  // Select a Flipz table (joins the table lobby, doesn't sit yet)
  socket.on('select_flipz_table', (payload: { tableId: string }) => {
    try {
      const gameType = socketGameType.get(socket.id);
      if (gameType !== 'flipz') {
        socket.emit('error', 'Must be in Flipz mode to select a table');
        return;
      }

      const player = flipzPlayers.get(socket.id);
      if (!player) {
        socket.emit('error', 'Player not found in Flipz lobby');
        return;
      }

      const tableGame = flipzTables.get(payload.tableId);
      if (!tableGame) {
        socket.emit('error', 'Table not found');
        return;
      }

      // Update player's selected table
      player.tableId = payload.tableId;
      flipzPlayers.set(socket.id, player);
      playerTableMap.set(socket.id, payload.tableId);

      // Register socket with the table game
      tableGame.registerSocket(socket, player);

      // Send the table's game state
      const gameState = tableGame.getGameState();
      socket.emit('game_state', gameState);

      console.log(`🎯 ${player.name} selected Flipz table: ${payload.tableId}`);
    } catch (error) {
      console.error('Error selecting Flipz table:', error);
      socket.emit('error', 'Failed to select table');
    }
  });

  // Sit down at the table
  socket.on('sit_down', (payload?: { seatIndex?: number; buyInAmount?: number }) => {
    try {
      // Route to appropriate game based on game type
      const gameType = socketGameType.get(socket.id);
      console.log(`🪑 sit_down received from ${socket.id}, gameType: ${gameType}, payload:`, payload);

      // Try SDK game first (generic routing)
      const sdkGame = getSDKGame(socket.id);
      if (sdkGame) {
        const player = sdkGame.playerMap.get(socket.id);
        if (!player) {
          socket.emit('error', `Player not found in ${gameType} game`);
          return;
        }

        const buyInPennies = (payload?.buyInAmount || (sdkGame.defaultBuyIn / 100)) * 100;
        const result = sdkGame.gameInstance.sitPlayer(player, payload?.seatIndex, buyInPennies);
        if (!result.success) {
          socket.emit('error', result.error || 'Failed to sit down');
          return;
        }

        console.log(`${sdkGame.emoji} ${player.name} sat down at table`);

        // Register socket with game so broadcasts reach this player
        sdkGame.gameInstance.registerSocket(socket, player);
        console.log(`${sdkGame.emoji} Registered socket for ${player.name}`);

        // Use game's broadcast method instead of direct io.emit
        (sdkGame.gameInstance as any).broadcastGameState();
        return;
      }

      if (gameType === 'flipz') {
        console.log(`🪙 [Flipz sit_down] Processing for socket ${socket.id}`);
        const player = flipzPlayers.get(socket.id);
        console.log(`🪙 [Flipz sit_down] Player from flipzPlayers:`, player);
        if (!player) {
          console.log(`🪙 [Flipz sit_down] ERROR: Player not found in flipzPlayers map`);
          socket.emit('error', 'Player not found in Flipz lobby');
          return;
        }

        // Get player's selected table
        const tableId = playerTableMap.get(socket.id);
        console.log(`🪙 [Flipz sit_down] Selected table ID: ${tableId}`);
        if (!tableId) {
          console.log(`🪙 [Flipz sit_down] ERROR: No table selected in playerTableMap`);
          socket.emit('error', 'No table selected. Please select a table first.');
          return;
        }

        const tableGame = flipzTables.get(tableId);
        console.log(`🪙 [Flipz sit_down] Table game found: ${!!tableGame}`);
        console.log(`🪙 [Flipz sit_down] Available tables:`, Array.from(flipzTables.keys()));
        if (!tableGame) {
          console.log(`🪙 [Flipz sit_down] ERROR: Table ${tableId} not found in flipzTables`);
          socket.emit('error', 'Selected table not found');
          return;
        }

        // Check if player is already seated using SDK method
        console.log(`🪙 [Flipz sit_down] Checking if player is already seated...`);
        const isSeated = tableGame.isPlayerSeated(socket.id);
        console.log(`🪙 [Flipz sit_down] Is player seated? ${isSeated}`);
        if (isSeated) {
          console.log(`🪙 ${player.name} is already seated at ${tableId}, ignoring sit_down`);
          socket.emit('error', 'You are already seated');
          return;
        }

        console.log(`🪙 [Flipz sit_down] Calling sitPlayer with seatIndex=${payload?.seatIndex}, buyIn=${(payload?.buyInAmount || 1) * 100} pennies`);
        const result = tableGame.sitPlayer(player, payload?.seatIndex, (payload?.buyInAmount || 1) * 100);
        console.log(`🪙 [Flipz sit_down] sitPlayer result:`, result);
        if (!result.success) {
          console.log(`🪙 [Flipz sit_down] ERROR: sitPlayer failed - ${result.error}`);
          socket.emit('error', result.error || 'Failed to sit down');
          return;
        }

        console.log(`🪙 ${player.name} sat down at Flipz table ${tableId}`);

        // Socket is already registered from select_flipz_table, just broadcast
        console.log(`🪙 Socket already registered for ${player.name} with Flipz table ${tableId}`);

        // Use game's broadcast method instead of direct io.emit
        (tableGame as any).broadcastGameState();
        return;
      }

      // Default to Pirate Plunder if no game type specified
      console.log(`Sit down request from ${socket.id}`, payload);
      const player = socketIdToPlayer.get(socket.id);
      if (!player) {
        console.log(`No player found for socket ${socket.id}`);
        return;
      }
      
      console.log(`Player ${player.name} attempting to sit down`);
      console.log(`  Current player bankroll: $${player.bankroll / 100}`);
      
      // Validate and deduct buy-in amount from player bankroll
      let tableStack = player.bankroll; // Default to full bankroll
      if (payload?.buyInAmount && payload.buyInAmount > 0) {
        const buyInPennies = payload.buyInAmount * 100; // Convert to pennies
        if (buyInPennies > player.bankroll) {
          console.log(`  ERROR: Player ${player.name} tried to buy in with $${payload.buyInAmount} but only has $${player.bankroll / 100}`);
          socket.emit('error', 'Insufficient bankroll for buy-in amount');
          return;
        }

        // Check table minimum requirement
        const requiredTableStack = calculateRequiredTableStack();
        if (buyInPennies < requiredTableStack) {
          console.log(`  ERROR: Player ${player.name} tried to sit with $${payload.buyInAmount} but table minimum is $${requiredTableStack / 100}`);
          socket.emit('error', `Table minimum is $${(requiredTableStack / 100).toFixed(2)} to sit down`);
          return;
        }
        // Deduct from player's bankroll and set table stack
        console.log(`  Buy-in amount: $${payload.buyInAmount} (${buyInPennies} pennies)`);
        console.log(`  Before: Player bankroll = $${player.bankroll / 100}, Table stack will be = $${buyInPennies / 100}`);
        const beforeBalance = player.bankroll;
        player.bankroll -= buyInPennies;
        tableStack = buyInPennies;
        console.log(`  After: Player bankroll = $${player.bankroll / 100}, Table stack = $${tableStack / 100}`);

        // Log the buy-in transaction
        logMoneyFlow(
          'BANKROLL_TO_TABLE',
          player.googleId || socket.id,
          player.name,
          'PLAYER_BANKROLL',
          'TABLE_STACK',
          buyInPennies,
          `${player.name} bought in for ${buyInPennies} pennies (from ${beforeBalance} to ${player.bankroll})`,
          {
            beforeBalance,
            afterBalance: player.bankroll,
            tableStack,
            buyInAmount: payload.buyInAmount,
            phase: 'Lobby'
          }
        );
        
        // Persist the new bankroll to database
        if (player.googleId) {
          updateUserBankroll(player.googleId, player.bankroll / 100);
        }
      } else {
        // No buy-in amount specified, using full bankroll as table stack
        // Still need to check table minimum requirement
        const requiredTableStack = calculateRequiredTableStack();
        if (tableStack < requiredTableStack) {
          console.log(`  ERROR: Player ${player.name} tried to sit with full bankroll $${tableStack / 100} but table minimum is $${requiredTableStack / 100}`);
          socket.emit('error', `Table minimum is $${(requiredTableStack / 100).toFixed(2)} to sit down`);
          return;
        }
      }

      if (seatPlayer(player, tableStack)) {
        console.log(`Player ${player.name} sat down at the table`);
        logBankrollOperation('SIT_DOWN_SUCCESS', `${player.name} sat down`, {
          playerBankrollAfterSitPennies: player.bankroll,
          playerBankrollAfterSitDollars: player.bankroll / 100,
          tableStackPennies: tableStack,
          tableStackDollars: tableStack / 100,
          playerId: player.id
        });

        // Save table bankroll to database for crash recovery
        const seatIndex = tableState.seats.findIndex(p => p?.id === player.id);
        if (seatIndex !== -1) {
          saveTableBankroll(player, seatIndex, tableStack);
        }
        
        // Auto-fill with AI when human sits (with error handling)
        try {
          console.log(`🤖 Calling autoFillAI after ${player.name} sat down`);
          autoFillAI();
        } catch (e) {
          console.error('Error in autoFillAI after player sat down:', e);
        }
        
        // Update the player in socketIdToPlayer to ensure lobby state is accurate
        console.log(`🔄 Before broadcasting: player ${player.name} has bankroll $${player.bankroll / 100}`);
        socketIdToPlayer.set(socket.id, player);
        
        // Broadcast both table and lobby state to update UI
        console.log(`📡 Broadcasting table state after ${player.name} sat down`);
        console.log(`📊 Table seats status:`, tableState.seats.map((s, i) => s ? `${i}: ${s.name} (${s.id})` : `${i}: empty`));
        broadcastTableState();
        console.log(`📡 Broadcasting lobby state after ${player.name} sat down`);
        broadcastLobbyState(); // This updates player bankrolls in UI
        
        // Use the unified countdown system instead of old game start logic
        console.log(`🎯 Calling maybeStartOrResetCountdown after ${player.name} sat down`);
        maybeStartOrResetCountdown();
      } else {
        console.log(`Failed to seat player ${player.name} - table may be full`);
      }
    } catch (error) {
      console.error('Error in sit_down handler:', error);
    }
  });
  
  // Stand up immediately from the table (fold current hand)
  socket.on('stand_up_immediate', () => {
    const player = socketIdToPlayer.get(socket.id);
    if (!player) return;
    
    console.log(`Player ${player.name} requesting to stand up immediately`);
    
    // Check if game is in progress and player is in the game
    if (gameState && gameState.phase !== 'Lobby' && gameState.phase !== 'HandEnd') {
      const seat = gameState.seats.find(s => s.playerId === player.id);
      if (seat && !seat.hasFolded) {
        // Fold the player immediately
        seat.hasFolded = true;
        seat.hasActed = true;
        console.log(`  💸 Player ${player.name} folded immediately for stand up`);
        
        // If it's their turn, advance to next player
        if (gameState.currentTurnPlayerId === player.id) {
          advanceTurn();
        }
        
        broadcastGameState();
      }
    }
    
    // Then stand up normally
    console.log(`  Current player bankroll: $${player.bankroll / 100}`);
    
    if (standUpPlayer(player.id)) {
      console.log(`  Successfully stood up immediately`);
      console.log(`  Updated player bankroll: $${player.bankroll / 100}`);
      
      // Ensure player state is updated in socketIdToPlayer map
      socketIdToPlayer.set(socket.id, player);
      
      autoFillAI(); // Rebalance AI when human leaves
      broadcastTableState();
      broadcastLobbyState();
      checkAndSpinDownAIOnlyGame();
    } else {
      console.log(`  Failed to stand up immediately`);
    }
  });
  
  // Stand up from the table
  socket.on('stand_up', () => {
    // Route to appropriate game based on game type
    const gameType = socketGameType.get(socket.id);

    if (gameType === 'warfaire' && warfaireGame) {
      const player = warfairePlayers.get(socket.id);
      if (!player) {
        socket.emit('error', 'Player not found in WarFaire game');
        return;
      }

      const result = warfaireGame.standPlayer(player.id, true); // immediate=true in Lobby
      if (!result.success) {
        socket.emit('error', result.error || 'Failed to stand up');
        return;
      }

      console.log(`🎪 ${player.name} stood up from WarFaire table`);

      // Broadcast first so player receives update
      (warfaireGame as any).broadcastGameState();

      // Then unregister socket from game
      warfaireGame.unregisterSocket(player.id);
      return;
    }

    if (gameType === 'flipz') {
      const player = flipzPlayers.get(socket.id);
      if (!player) {
        socket.emit('error', 'Player not found in Flipz lobby');
        return;
      }

      // Get player's selected table
      const tableId = playerTableMap.get(socket.id);
      if (!tableId) {
        socket.emit('error', 'No table selected');
        return;
      }

      const tableGame = flipzTables.get(tableId);
      if (!tableGame) {
        socket.emit('error', 'Selected table not found');
        return;
      }

      const result = tableGame.standPlayer(player.id, true); // immediate=true in Lobby
      if (!result.success) {
        socket.emit('error', result.error || 'Failed to stand up');
        return;
      }

      console.log(`🪙 ${player.name} stood up from Flipz table ${tableId}`);

      // Broadcast first so player receives update
      (tableGame as any).broadcastGameState();

      // Then unregister socket from game
      tableGame.unregisterSocket(player.id);
      return;
    }

    // Default to Pirate Plunder
    const player = socketIdToPlayer.get(socket.id);
    if (!player) return;
    
    console.log(`Player ${player.name} requesting to stand up`);
    
    // Check if game is in progress
    if (gameState && gameState.phase !== 'Lobby' && gameState.phase !== 'HandEnd' && gameState.phase !== 'PreHand') {
      // Mark player to be removed after the current hand
      const seat = gameState.seats.find(s => s.playerId === player.id);
      if (seat) {
        seat.standingUp = true;
        console.log(`  🚪 Player ${player.name} marked for standing up after current hand (phase: ${gameState.phase})`);
        console.log(`  🎮 Current game state: ${gameState.seats.length} seats, ${gameState.seats.filter(s => !s.hasFolded).length} active`);
        socket.emit('stand_up_pending', { message: 'You will stand up after the current hand' });
        broadcastGameState();
      } else {
        console.log(`  ❌ Could not find seat for player ${player.name} in game state`);
      }
    } else {
      // No game in progress, stand up immediately
      console.log(`  Current player bankroll: $${player.bankroll / 100}`);
      
      if (standUpPlayer(player.id)) {
        console.log(`  Successfully stood up`);
        console.log(`  Updated player bankroll: $${player.bankroll / 100}`);
        
        // Ensure player state is updated in socketIdToPlayer map
        socketIdToPlayer.set(socket.id, player);
        
        autoFillAI(); // Rebalance AI when human leaves
        
        // Check if game should reset due to insufficient players in PreHand/Lobby
        if (gameState && (gameState.phase === 'PreHand' || gameState.phase === 'Lobby')) {
          const remainingPlayers = tableState.seats.filter(s => s !== null);
          const humanCount = remainingPlayers.filter(p => p && !p.id.startsWith('ai_')).length;
          const minHumans = configService.getConfig().table.minHumanPlayers;
          
          if (humanCount < minHumans) {
            console.log(`🔄 Resetting game state: ${humanCount} humans < ${minHumans} required`);
            gameState = null;
            broadcastGameState();
          }
        }
        
        broadcastTableState();
        broadcastLobbyState(); // This updates player bankrolls in UI
        checkAndSpinDownAIOnlyGame();
      } else {
        console.log(`  Failed to stand up`);
      }
    }
  });

  // Top up table stack from bankroll
  socket.on('top_up', (payload: { amount: number }) => {
    const player = socketIdToPlayer.get(socket.id);
    if (!player) return;

    const amount = Math.round((payload.amount || 0) * 100); // Convert to cents

    if (amount <= 0) {
      socket.emit('error', { message: 'Invalid top-up amount' });
      return;
    }

    if (amount > player.bankroll) {
      socket.emit('error', { message: 'Insufficient bankroll for top-up' });
      return;
    }

    // Check if player is seated
    const tablePlayer = tableState.seats.find((p: Player | null) => p && p.id === player.id);
    if (!tablePlayer) {
      socket.emit('error', { message: 'Must be seated at table to top up' });
      return;
    }

    console.log(`💰 [${player.name}] Top-up request: ${amount} cents from bankroll`);

    // Transfer funds from bankroll to table stack
    player.bankroll -= amount;
    tablePlayer.tableStack = (tablePlayer.tableStack || 0) + amount;

    // Log the transfer
    logMoneyFlow(
      'BANKROLL_TO_TABLE',
      player.id,
      player.name,
      'PLAYER_BANKROLL',
      'TABLE_STACK',
      amount,
      `${player.name} topped up table stack by ${amount} pennies`,
      {
        newBankroll: player.bankroll,
        newTableStack: tablePlayer.tableStack,
        transferAmount: amount
      }
    );

    // Update player in socket map
    socketIdToPlayer.set(socket.id, player);

    // Update game seat if in active game
    if (gameState) {
      const gameSeat = gameState.seats.find(s => s.playerId === player.id);
      if (gameSeat) {
        gameSeat.tableStack = tablePlayer.tableStack;
      }
    }

    console.log(`💰 [${player.name}] Top-up completed: Bankroll ${player.bankroll}, Table Stack ${tablePlayer.tableStack}`);

    // Broadcast updated states
    broadcastTableState();
    broadcastLobbyState();
    if (gameState) {
      broadcastGameState();
    }

    // Send success confirmation
    socket.emit('top_up_success', {
      amount: amount / 100, // Convert back to dollars for frontend
      newBankroll: player.bankroll / 100,
      newTableStack: tablePlayer.tableStack / 100
    });
  });

  // Admin: Table configuration is now managed via HTTP API endpoints, not socket events

  // Add N AI players (default 1)
  socket.on('add_ai', (payload?: { count?: number }) => {
    gameDebugger.logEvent('add_ai', socket.id, payload);

    // Route to appropriate game based on game type
    const gameType = socketGameType.get(socket.id);

    console.log(`🔍 add_ai handler - gameType: ${gameType}`);

    // Try SDK game first (generic routing)
    const sdkGame = getSDKGame(socket.id);
    if (sdkGame) {
      const requestedCount = payload?.count ?? 1;
      console.log(`${sdkGame.emoji} Adding ${requestedCount} AI via SDK`);

      // Use SDK method with factory function
      const added = sdkGame.gameInstance.addAIPlayers(requestedCount, () => ({
        id: `${gameType}_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${sdkGame.botNamePrefix} ${Math.floor(Math.random() * 900) + 100}`,
        isAI: true,
        bankroll: 100000, // $1000 in pennies
      }), sdkGame.defaultBuyIn);

      console.log(`${sdkGame.emoji} Added ${added}/${requestedCount} AI via SDK`);

      // Broadcast updated game state
      (sdkGame.gameInstance as any).broadcastGameState();
      return;
    }

    if (gameType === 'flipz') {
      // Get player's selected table
      const tableId = playerTableMap.get(socket.id);
      if (!tableId) {
        socket.emit('error', 'No table selected');
        return;
      }

      const tableGame = flipzTables.get(tableId);
      if (!tableGame) {
        socket.emit('error', 'Selected table not found');
        return;
      }

      // Find table config to get minimum buy-in amount
      const tableConfig = FLIPZ_TABLES.find(t => t.tableId === tableId);
      const ante = tableConfig?.ante || 100;
      const minBuyInMultiplier = tableConfig?.minBuyInMultiplier || 5;
      const buyInAmount = ante * minBuyInMultiplier; // 5x ante by default

      const requestedCount = payload?.count ?? 1;
      console.log(`🪙 Adding ${requestedCount} AI to Flipz table ${tableId} with buy-in of $${buyInAmount/100}`);

      // Use SDK method with factory function and table's buy-in
      const added = tableGame.addAIPlayers(requestedCount, () => ({
        id: `flipz_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `FlipBot ${Math.floor(Math.random() * 900) + 100}`,
        isAI: true,
        bankroll: 100000, // $1000 in pennies
      }), buyInAmount);

      console.log(`🪙 Added ${added}/${requestedCount} AI to Flipz table ${tableId} via SDK`);

      // Broadcast updated game state
      (tableGame as any).broadcastGameState();
      return;
    }

    // Default to Pirate Plunder
    const maxSeats = 8;
    const requestedCount = payload?.count ?? 1;

    if (!gameState || gameState.phase === 'Lobby') {
      // During lobby - add to aiPlayers array AND seat them at the table
      const currentTotal = socketIdToPlayer.size + aiPlayers.length;
      const availableSeats = maxSeats - currentTotal;
      const emptyTableSeats = tableState.seats.filter(s => s === null).length;
      const count = Math.max(0, Math.min(Math.min(availableSeats, emptyTableSeats), requestedCount));

      console.log(`🤖 Adding ${count} AI players (requested: ${requestedCount}, available lobby: ${availableSeats}, empty table seats: ${emptyTableSeats})`);

      for (let i = 0; i < count; i += 1) {
        const newAi = createAiPlayer();
        aiPlayers.push(newAi);

        // Automatically seat the AI player with default stack
        const defaultAIStack = 5000; // $50 in pennies
        newAi.tableStack = defaultAIStack;
        if (seatPlayer(newAi, defaultAIStack)) {
          console.log(`🤖 Seated AI player ${newAi.name} with $${defaultAIStack / 100}`);
        } else {
          console.warn(`⚠️ Failed to seat AI player ${newAi.name} - table may be full`);
        }
      }

      broadcastLobbyState();
      broadcastTableState(); // Broadcast table state to show seated AI
      maybeStartOrResetCountdown();
    } else {
      // During active game - add directly to empty seats with default bankroll
      const emptySeats = gameState.seats.filter(s => !s.playerId);
      const count = Math.min(requestedCount, emptySeats.length);
      
      for (let i = 0; i < count; i += 1) {
        const emptySeat = emptySeats[i];
        if (emptySeat) {
          const newAi = createAiPlayer();
          aiPlayers.push(newAi);
          
          emptySeat.playerId = newAi.id;
          emptySeat.name = newAi.name;
          emptySeat.isAI = true;
          emptySeat.tableStack = 100; // Default AI starting table stack
          emptySeat.aiProfile = newAi.aiProfile;
          emptySeat.cosmetics = {};
        }
      }
      broadcastGameState();
    }
  });

  // Remove N AI players (default 1)
  socket.on('remove_ai', (payload?: { count?: number }) => {
    gameDebugger.logEvent('remove_ai', socket.id, payload);
    const requestedCount = payload?.count ?? 1;
    
    if (!gameState || gameState.phase === 'Lobby') {
      // During lobby - remove immediately from aiPlayers array
      const count = Math.min(requestedCount, aiPlayers.length);
      for (let i = 0; i < count; i += 1) {
        aiPlayers.pop();
      }
      broadcastLobbyState();
      maybeStartOrResetCountdown();
    } else {
      // During active game - mark AI players for removal after hand ends
      const aiSeats = gameState.seats.filter(s => s.isAI && s.playerId);
      const count = Math.min(requestedCount, aiSeats.length);
      
      for (let i = 0; i < count; i += 1) {
        const aiSeat = aiSeats[i];
        if (aiSeat) {
          aiSeat.standingUp = true;
        }
      }
      broadcastGameState();
    }
  });

  // Ensure at least min players by adding AI
  socket.on('fill_ai_to_min', (payload?: { min?: number }) => {
    gameDebugger.logEvent('fill_ai_to_min', socket.id, payload);
    const maxSeats = 8;
    const min = Math.max(1, Math.min(maxSeats, payload?.min ?? 4));
    const total = socketIdToPlayer.size + aiPlayers.length;
    const availableSeats = maxSeats - total;
    const needed = Math.max(0, Math.min(availableSeats, min - total));
    
    for (let i = 0; i < needed; i += 1) {
      aiPlayers.push(createAiPlayer());
    }
    broadcastLobbyState();
    maybeStartOrResetCountdown();
  });

  // Helper function to start WarFaire game (shared by start_hand event and player_action)
  const startWarFaireGame = () => {
    if (!warfaireGame) return { success: false, error: 'WarFaire game not initialized' };

    // Call startHand() which sets up the game but doesn't start the round yet
    (warfaireGame as any).startHand();

    console.log(`🎪 WarFaire game started`);

    // Use game's broadcast method
    (warfaireGame as any).broadcastGameState();

    // Start the first round after a 1-second delay to ensure players see their 3 face-down cards
    // This prevents the immediate flip that would show only 2 cards
    if ((warfaireGame as any).needsFirstRound) {
      console.log(`🎪 Scheduling first round to start in 1 second...`);
      (warfaireGame as any).needsFirstRound = false;

      setTimeout(() => {
        console.log(`🎪 Starting first round after delay`);
        (warfaireGame as any).startRound();

        const updatedState = (warfaireGame as any).getGameState();
        io.emit('game_state', updatedState);
        console.log(`📡 Broadcasting WarFaire game state after first round started (1 card flipped)`);
      }, 1000); // 1 second delay
    }

    return { success: true };
  };

  // Start a new hand using seated players
  socket.on('start_hand', () => {
    gameDebugger.logEvent('start_hand', socket.id);

    // Route to appropriate game based on game type
    const gameType = socketGameType.get(socket.id);

    if (gameType === 'warfaire') {
      const result = startWarFaireGame();
      if (!result.success) {
        socket.emit('error', result.error || 'Failed to start game');
      }
      return;
    }

    if (gameType === 'flipz') {
      // Get player's selected table
      const tableId = playerTableMap.get(socket.id);
      if (!tableId) {
        socket.emit('error', 'No table selected');
        return;
      }

      const tableGame = flipzTables.get(tableId);
      if (!tableGame) {
        socket.emit('error', 'Selected table not found');
        return;
      }

      const result = (tableGame as any).startGame();

      if (!result.success) {
        socket.emit('error', result.error || 'Failed to start game');
        return;
      }

      console.log(`🪙 Flipz game started on table ${tableId}`);

      // Broadcast updated game state using table's broadcast method
      (tableGame as any).broadcastGameState();
      console.log(`📡 Broadcasting Flipz game state after starting ${tableId}`);
      return;
    }

    // Default to Pirate Plunder
    startNewHand();
  });

  // Admin: Reset game to lobby
  socket.on('admin_reset_game', async () => {
    gameDebugger.logEvent('admin_reset_game', socket.id);

    const player = socketIdToPlayer.get(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    // Check if player is admin
    if (player.googleId) {
      const result = await pgPool.query('SELECT "isAdmin" FROM users WHERE "googleId" = $1', [player.googleId]);
      if (!result.rows[0]?.isAdmin) {
        socket.emit('error', 'Only admins can reset the game');
        return;
      }
    } else {
      socket.emit('error', 'Only admins can reset the game');
      return;
    }

    const gameType = socketGameType.get(socket.id);
    console.log(`🔧 Admin ${player.name} resetting ${gameType} game to lobby`);

    if (gameType === 'warfaire' && warfaireGame) {
      // Reset WarFaire game to lobby
      const state = warfaireGame.getGameState();
      if (state) {
        state.phase = 'Lobby';
        // Clear game-specific state
        state.currentFair = 0;
        state.currentRound = 0;
        // Keep players seated but reset their game state
        state.seats.forEach((seat: any) => {
          if (seat) {
            seat.hand = [];
            seat.playedCards = [];
            seat.faceDownCards = [];
            seat.ribbons = [];
            seat.totalVP = 0;
            seat.hasActed = false;
          }
        });
      }
      io.emit('game_state', state);
      console.log(`🎪 WarFaire game reset to lobby`);
      return;
    }

    if (gameType === 'flipz') {
      // Get player's selected table
      const tableId = playerTableMap.get(socket.id);
      if (tableId) {
        const tableGame = flipzTables.get(tableId);
        if (tableGame) {
          // Reset Flipz game to lobby
          const state = tableGame.getGameState();
          if (state) {
            state.phase = 'Lobby';
          }
          (tableGame as any).broadcastGameState();
          console.log(`🪙 Flipz game reset to lobby on table ${tableId}`);
        }
      }
      return;
    }

    // Default to Pirate Plunder
    if (gameState) {
      gameState.phase = 'Lobby';
      gameState.pot = 0;
      gameState.currentBet = 0;
      gameState.handCount = 0;
      gameState.seats.forEach(seat => {
        if (seat) {
          seat.dice = [];
          seat.currentBet = 0;
          seat.hasFolded = false;
          seat.hasActed = false;
          seat.isAllIn = false;
        }
      });
      broadcastGameState();
      console.log(`🏴‍☠️ Pirate Plunder game reset to lobby`);
    }
  });

  // Player rolls their unlocked dice
  socket.on('roll', () => {
    // no-op: rolls happen automatically on phase entry now
  });

  // Toggle lock for a die index (0..4) - supports locking and unlocking
  socket.on('lock_select', (payload: { index: number }) => {
    gameDebugger.logEvent('lock_select', socket.id, payload);
    if (!gameState) return;
    if (!['Lock1', 'Lock2', 'Lock3'].includes(gameState.phase)) return;
    const seat = gameState.seats.find((s) => s.playerId === socket.id);
    if (!seat || seat.hasFolded) return;
    const i = payload?.index ?? -1;
    if (i < 0 || i >= seat.dice.length) return;
    const die = seat.dice[i]!;
    
    if (die.locked) {
      // Unlocking: check if we can still meet minimum requirements
      const currentLocked = seat.dice.filter(d => d.locked).length;
      const minRequired = seat.minLocksRequired || 1;
      if (currentLocked > minRequired) {
        // Can unlock this die
        seat.dice[i] = { value: die.value, locked: false, isPublic: false };
        seat.lockAllowance = Math.max(0, minRequired - (currentLocked - 1));
      }
    } else {
      // Locking: always allowed
      const dieValue = die.value || rollDie();
      seat.dice[i] = { value: dieValue, locked: true, isPublic: false };
      recordHandAction(socket.id, 'lock_die', undefined, [dieValue]);
      const currentLocked = seat.dice.filter(d => d.locked).length;
      const minRequired = seat.minLocksRequired || 1;
      seat.lockAllowance = Math.max(0, minRequired - currentLocked);
    }
    
    // Update which dice are visible to other players
    updateDicePublicVisibility(seat);
    
    // Don't auto-advance - wait for explicit done action
    broadcastGameState();
  });

  // Player confirms their dice locks
  socket.on('lock_done', () => {
    gameDebugger.logEvent('lock_done', socket.id);
    if (!gameState) return;
    if (!['Lock1', 'Lock2', 'Lock3'].includes(gameState.phase)) return;
    const seat = gameState.seats.find((s) => s.playerId === socket.id);
    if (!seat || seat.hasFolded) return;
    
    // Mark this player as done with locking
    seat.lockingDone = true;
    recordHandAction(socket.id, 'lock_done', undefined, seat.dice.filter(d => d.locked).map(d => d.value || 0));
    
    // Check if all players have finished locking
    const allDone = gameState.seats.every((s) => {
      if (s.hasFolded) return true;
      const locked = s.dice.filter(d => d.locked).length;
      const required = s.minLocksRequired || 1;
      return locked >= required && (s.isAI || s.lockingDone);
    });
    
    if (allDone) {
      if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
      delete gameState.phaseEndsAtMs;
      gameState.allLockingComplete = true;
      
      // Record lock phase for hand history
      recordLockPhase();
      
      // Now that all locking is complete, update dice visibility for all players
      gameState.seats.forEach(seat => {
        if (!seat.hasFolded) {
          updateDicePublicVisibility(seat);
        }
      });
      
      gameState.phase = nextPhase(gameState.phase);
      onEnterPhase();
    }
    
    broadcastGameState();
  });

  // Proper poker betting mechanics
  socket.on('player_action', (payload: any) => {
    gameDebugger.logEvent('player_action', socket.id, payload);

    // Route to appropriate game based on game type
    const gameType = socketGameType.get(socket.id);

    // Try SDK game first (generic routing)
    const sdkGame = getSDKGame(socket.id);
    if (sdkGame) {
      console.log(`${sdkGame.emoji} player_action: ${payload.action}`);

      const playerId = socket.id;
      const gameState = sdkGame.gameInstance.getGameState();

      // Find the player in the game
      const seat = gameState?.seats.find((s: any) => s && s.playerId === playerId);
      if (!seat) {
        console.log(`${sdkGame.emoji} Player ${playerId} not seated in game`);
        socket.emit('error', 'You are not seated in this game');
        return;
      }

      console.log(`${sdkGame.emoji} Handling action: ${payload.action} from ${seat.name}`);

      // Call the game's handlePlayerAction method
      // Note: WarFaire uses payload.data, HouseRules uses payload.amount
      const actionData = payload.data || payload.amount;
      (sdkGame.gameInstance as any).handlePlayerAction(playerId, payload.action, actionData);

      // Broadcast is handled by the game's handlePlayerAction method
      return;
    }

    // Handle WarFaire special actions (like add_ai via player_action)
    if (gameType === 'warfaire' && warfaireGame) {
      console.log(`🎪 WarFaire player_action: ${payload.action}`, payload.data);

      if (payload.action === 'add_ai') {
        const requestedCount = payload.data?.count ?? 1;
        console.log(`🎪 Adding ${requestedCount} AI to WarFaire game via player_action`);

        // Use SDK method with factory function
        const added = warfaireGame.addAIPlayers(requestedCount, () => ({
          id: `warfaire_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: `WarBot ${Math.floor(Math.random() * 900) + 100}`,
          isAI: true,
          bankroll: 10000, // WarFaire doesn't use bankroll
        }));

        console.log(`🎪 Added ${added}/${requestedCount} AI to WarFaire game via SDK`);

        // Broadcast updated game state
        const updatedState = warfaireGame.getGameState();
        io.emit('game_state', updatedState);
        return;
      }

      if (payload.action === 'start_hand') {
        console.log(`🎪 Starting WarFaire game via player_action`);

        try {
          const result = startWarFaireGame();
          if (!result.success) {
            socket.emit('error', result.error || 'Failed to start game');
          }
        } catch (error) {
          console.error(`❌ Failed to start WarFaire game:`, error);
          socket.emit('error', 'Failed to start game');
        }
        return;
      }

      // Handle other WarFaire actions
      const playerId = socket.id;
      const gameState = warfaireGame.getGameState();

      // Find the player in the WarFaire game
      const seat = gameState?.seats.find((s: any) => s && s.playerId === playerId);
      if (!seat) {
        console.log(`🎪 Player ${playerId} not seated in WarFaire game`);
        socket.emit('error', 'You are not seated in this game');
        return;
      }

      console.log(`🎪 Handling WarFaire action: ${payload.action} from ${seat.name}`);

      // Call the WarFaire game's handlePlayerAction method
      (warfaireGame as any).handlePlayerAction(playerId, payload.action, payload.data);

      // Broadcast updated game state
      const updatedState = warfaireGame.getGameState();
      io.emit('game_state', updatedState);
      console.log(`📡 Broadcasting WarFaire game state after ${payload.action}`);
      return;
    }

    // Handle Flipz actions
    if (gameType === 'flipz') {
      // Get player's selected table
      const tableId = playerTableMap.get(socket.id);
      if (!tableId) {
        socket.emit('error', 'No table selected');
        return;
      }

      const tableGame = flipzTables.get(tableId);
      if (!tableGame) {
        socket.emit('error', 'Selected table not found');
        return;
      }

      console.log(`🪙 Flipz player_action on table ${tableId}: ${payload.action}`, payload.data);

      if (payload.action === 'add_ai') {
        const tableConfig = FLIPZ_TABLES.find(t => t.tableId === tableId);
        const ante = tableConfig?.ante || 100;
        const minBuyInMultiplier = tableConfig?.minBuyInMultiplier || 5;
        const buyInAmount = ante * minBuyInMultiplier; // 5x ante by default
        const requestedCount = payload.data?.count ?? 1;
        console.log(`🪙 Adding ${requestedCount} AI to Flipz table ${tableId} via player_action with buy-in of $${buyInAmount/100}`);

        // Use SDK method with factory function
        const added = tableGame.addAIPlayers(requestedCount, () => ({
          id: `flipz_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: `FlipBot ${Math.floor(Math.random() * 900) + 100}`,
          isAI: true,
          bankroll: 100000, // $1000 in pennies
        }), buyInAmount);

        console.log(`🪙 Added ${added}/${requestedCount} AI to Flipz table ${tableId} via SDK`);

        // Broadcast updated game state
        (tableGame as any).broadcastGameState();
        return;
      }

      // Handle other Flipz actions (call_heads, call_tails, start_hand, call_red, call_black)
      const playerId = socket.id;
      tableGame.handlePlayerAction(playerId, payload.action, payload.data);

      // Broadcast updated game state
      (tableGame as any).broadcastGameState();
      return;
    }

    // Default to Pirate Plunder
    if (!gameState) return;
    if (!['Bet1', 'Bet2', 'Bet3'].includes(gameState.phase)) return;
    
    const seat = gameState.seats.find((s) => s.playerId === socket.id);
    if (!seat || seat.hasFolded) return;
    
    // Check if it's this player's turn
    if (gameState.currentTurnPlayerId !== socket.id) return;
    
    const action = payload?.action;
    
    if (action === 'fold') {
      seat.hasFolded = true;
      seat.hasActed = true;
      recordHandAction(socket.id, 'fold');
      recordBetAction(socket.id, 'fold');
    } else if (action === 'check') {
      // Only allowed if current bet is 0 or player has already matched the bet
      if (gameState.currentBet > (seat.currentBet || 0)) return;
      seat.hasActed = true;
      recordHandAction(socket.id, 'check');
      recordBetAction(socket.id, 'check');
    } else if (action === 'bet') {
      // Only allowed if current bet is 0
      if (gameState.currentBet > 0) return;
      const requestedAmount = Math.max(100, Math.floor(payload?.amount ?? 500)); // Default 500 gold bet
      const streetLimitedAmount = applyStreetLimits(requestedAmount, gameState, seat);
      const roundedAmount = applyBettingRounding(streetLimitedAmount);
      const actualBet = Math.min(roundedAmount, seat.tableStack);
      
      // Handle all-in
      if (actualBet >= seat.tableStack) {
        seat.isAllIn = true;
      }
      
      gameState.currentBet = actualBet;
      
      // Process drip to cargo chest
      const { mainPot: mainPotAmount, chestDrip } = processDripFromWager(gameState, actualBet);
      gameState.pot += mainPotAmount;
      
      gameState.bettingRoundCount = (gameState.bettingRoundCount || 0) + 1; // Track raises
      const beforeBalance = seat.tableStack;
      seat.tableStack -= actualBet;
      seat.currentBet = actualBet;
      seat.totalContribution = (seat.totalContribution || 0) + actualBet;
      console.log(`🎯 [${seat.name}] Updated totalContribution during bet: +${actualBet} = ${seat.totalContribution}`);
      seat.hasActed = true;

      // Log money flow
      logMoneyFlow(
        'BET',
        seat.playerId,
        seat.name,
        'TABLE_STACK',
        'MAIN_POT',
        actualBet,
        `${seat.name} bet ${actualBet} pennies (from ${beforeBalance} to ${seat.tableStack})`,
        {
          beforeBalance,
          afterBalance: seat.tableStack,
          potBefore: gameState.pot - mainPotAmount,
          potAfter: gameState.pot,
          chestDrip,
          requestedAmount,
          streetLimited: streetLimitedAmount,
          rounded: roundedAmount,
          isAllIn: seat.isAllIn,
          edgeMultiplier: 1.0
        }
      );
      recordHandAction(socket.id, 'bet', actualBet);
      recordBetAction(socket.id, 'bet', actualBet);
      // Stamps awarded only once per hand during showdown based on participation
      
      // Reset all other players' hasActed status since they need to respond to the bet
      for (const s of gameState.seats) {
        if (s.playerId !== socket.id && !s.hasFolded && !s.isAllIn) {
          s.hasActed = false;
        }
      }
    } else if (action === 'call') {
      // Match the current bet (apply edge tier discount)
      const fullAmountToCall = gameState.currentBet - (seat.currentBet || 0);
      if (fullAmountToCall <= 0) return;
      const discountedAmountToCall = applyEdgeTierMultiplier(fullAmountToCall, seat, gameState);
      const roundedAmountToCall = applyBettingRounding(discountedAmountToCall);
      const actualCallAmount = Math.min(roundedAmountToCall, seat.tableStack);
      
      // Log edge tier application
      if (discountedAmountToCall !== fullAmountToCall) {
        const tier = calculateEdgeTier(seat, gameState);
        console.log(`🎯 [${seat.name}] Edge tier ${tier}: ${fullAmountToCall} → ${discountedAmountToCall} → ${roundedAmountToCall} (${Math.round((roundedAmountToCall/fullAmountToCall)*100)}%)`);
      }
      
      // Handle all-in
      if (actualCallAmount >= seat.tableStack) {
        seat.isAllIn = true;
      }
      
      // Process drip to cargo chest
      const { mainPot: mainPotAmount } = processDripFromWager(gameState, actualCallAmount);
      gameState.pot += mainPotAmount;
      
      const beforeBalance = seat.tableStack;
      seat.tableStack -= actualCallAmount;
      seat.currentBet = (seat.currentBet || 0) + actualCallAmount;
      seat.totalContribution = (seat.totalContribution || 0) + actualCallAmount;
      console.log(`🎯 [${seat.name}] Updated totalContribution during call: +${actualCallAmount} = ${seat.totalContribution}`);
      seat.hasActed = true;

      // Log money flow with edge tier details
      const edgeMultiplier = fullAmountToCall > 0 ? discountedAmountToCall / fullAmountToCall : 1.0;
      logMoneyFlow(
        'CALL',
        seat.playerId,
        seat.name,
        'TABLE_STACK',
        'MAIN_POT',
        actualCallAmount,
        `${seat.name} called ${actualCallAmount} pennies (from ${beforeBalance} to ${seat.tableStack})`,
        {
          beforeBalance,
          afterBalance: seat.tableStack,
          potBefore: gameState.pot - mainPotAmount,
          potAfter: gameState.pot,
          fullAmountToCall,
          discountedAmount: discountedAmountToCall,
          rounded: roundedAmountToCall,
          edgeMultiplier,
          isAllIn: seat.isAllIn,
          edgeTier: calculateEdgeTier(seat, gameState)
        }
      );

      recordHandAction(socket.id, 'call', actualCallAmount);
      recordBetAction(socket.id, 'call', actualCallAmount);
      
      // Stamps awarded only once per hand during showdown based on participation
    } else if (action === 'raise') {
      // First call, then raise
      const callAmount = gameState.currentBet - (seat.currentBet || 0);
      const requestedRaiseAmount = Math.max(gameState.currentBet, Math.floor(payload?.amount ?? gameState.currentBet * 2));
      const streetLimitedRaise = applyStreetLimits(requestedRaiseAmount, gameState, seat);
      const roundedRaise = applyBettingRounding(streetLimitedRaise);
      const totalRequested = callAmount + roundedRaise;
      const actualTotalAmount = Math.min(totalRequested, seat.tableStack);
      
      // Handle all-in
      if (actualTotalAmount >= seat.tableStack) {
        seat.isAllIn = true;
        // Adjust current bet for all-in raise
        const actualRaise = Math.max(0, seat.tableStack - callAmount);
        gameState.currentBet = (seat.currentBet || 0) + callAmount + actualRaise;
      } else {
        gameState.currentBet += roundedRaise;
      }
      
      gameState.bettingRoundCount = (gameState.bettingRoundCount || 0) + 1; // Track raises
      
      // Process drip to cargo chest  
      const { mainPot: mainPotAmount } = processDripFromWager(gameState, actualTotalAmount);
      gameState.pot += mainPotAmount;
      
      const beforeBalance = seat.tableStack;
      seat.tableStack -= actualTotalAmount;
      seat.currentBet = Math.min(gameState.currentBet, (seat.currentBet || 0) + actualTotalAmount);
      seat.totalContribution = (seat.totalContribution || 0) + actualTotalAmount;
      console.log(`🎯 [${seat.name}] Updated totalContribution during raise: +${actualTotalAmount} = ${seat.totalContribution}`);
      seat.hasActed = true;

      // Log money flow for raise
      logMoneyFlow(
        'RAISE',
        seat.playerId,
        seat.name,
        'TABLE_STACK',
        'MAIN_POT',
        actualTotalAmount,
        `${seat.name} raised ${actualTotalAmount} pennies (from ${beforeBalance} to ${seat.tableStack})`,
        {
          beforeBalance,
          afterBalance: seat.tableStack,
          potBefore: gameState.pot - mainPotAmount,
          potAfter: gameState.pot,
          callAmount,
          requestedRaise: requestedRaiseAmount,
          streetLimited: streetLimitedRaise,
          roundedRaise,
          totalRequested,
          isAllIn: seat.isAllIn
        }
      );
      recordHandAction(socket.id, 'raise', actualTotalAmount);
      recordBetAction(socket.id, 'raise', actualTotalAmount);
      // Stamps awarded only once per hand during showdown based on participation
      
      // Reset all other players' hasActed status since they need to respond to the raise
      for (const s of gameState.seats) {
        if (s.playerId !== socket.id && !s.hasFolded && !s.isAllIn) {
          s.hasActed = false;
        }
      }
    }
    
    // Move to next player
    advanceTurn();
    broadcastGameState();
  });

  // Advance to the next phase
  socket.on('next_phase', () => {
    gameDebugger.logEvent('next_phase', socket.id);
    if (!gameState) return;
    gameState.phase = nextPhase(gameState.phase);
    onEnterPhase();
    broadcastGameState();
  });
  
  // Admin command to audit system money
  socket.on('audit_money', () => {
    const player = socketIdToPlayer.get(socket.id);
    if (player?.googleId) {
      // Check if admin from session
      pgPool.query('SELECT "isAdmin" FROM users WHERE "googleId" = $1', [player.googleId])
        .then(result => {
          if (result.rows[0]?.isAdmin) {
            console.log(`🔍 Admin ${player.name} requested money audit`);
            const audit = auditSystemMoney();
            socket.emit('audit_result', audit);
          }
        })
        .catch(error => {
          console.error('Failed to check admin status for audit:', error);
        });
    }
  });

  // Send current state to requester
  socket.on('request_game_state', () => {
    broadcastGameState();
  });


    

  socket.on('disconnect', () => {
    gameDebugger.logEvent('disconnect', socket.id);
    gameDebugger.removeConnection(socket.id);
    
    const player = socketIdToPlayer.get(socket.id);
    if (player) {
      console.log(`🔌 Player ${player.name} disconnected (${socket.id})`);
      
      // If they're in a game or have a googleId, give them time to reconnect
      const isInGame = gameState && gameState.seats.some(s => s.playerId === socket.id);
      const hasGoogleId = player.googleId;
      
      if ((isInGame || hasGoogleId) && !player.isAI) {
        console.log(`⏳ Giving ${player.name} time to reconnect (in game: ${!!isInGame}, has account: ${!!hasGoogleId})`);
        // Don't stand them up immediately - let them reconnect
        // Mark as disconnected in table state if needed
        const tableSeat = tableState.seats.find(s => s?.id === socket.id);
        if (tableSeat) {
          tableSeat.name = `${player.name} (disconnected)`;
        }
        
        // Set up timeout to clean up after 2 minutes if they don't reconnect
        setTimeout(() => {
          cleanupDisconnectedPlayer(player);
        }, 120000); // 2 minutes
      } else {
        // Stand up immediately for guests/non-game players
        standUpPlayer(player.id);
        autoFillAI();
        broadcastTableState();
      }
    }
    
    // Handle disconnection during active game - use timeout system instead of immediate folding
    if (gameState && gameState.phase !== 'Lobby' && player && !player.isAI) {
      const disconnectedSeat = gameState.seats.find(s => s.playerId === socket.id);
      if (disconnectedSeat) {
        console.log(`🎮 ${player.name} disconnected during active game phase ${gameState.phase}`);

        // Check if it was their turn
        const wasTheirTurn = gameState.currentTurnPlayerId === socket.id;

        // If they disconnected during their turn, we need to pause the phase timer
        if (wasTheirTurn && phaseTimer) {
          console.log(`⏸️ Pausing phase timer for disconnected player ${player.name}`);
          clearTimeout(phaseTimer);
          phaseTimer = null;
        }

        // Start timeout system instead of immediate folding
        startDisconnectionTimeouts(player, wasTheirTurn);

        // Mark as disconnected in game seat name for UI indication
        disconnectedSeat.name = `${player.name} (disconnected)`;
        broadcastGameState();
      }
    }

    // Handle disconnection during WarFaire game
    if (warfaireGame && player && !player.isAI) {
      const warfaireState = warfaireGame.getGameState();
      if (warfaireState && warfaireState.phase !== 'Lobby') {
        const disconnectedSeat = warfaireState.seats.find((s: any) => s && s.playerId === socket.id);
        if (disconnectedSeat) {
          console.log(`🎪 ${player.name} disconnected during WarFaire game phase ${warfaireState.phase}`);

          // Mark as disconnected in game seat name for UI indication
          disconnectedSeat.name = `${player.name} (disconnected)`;

          // Unregister disconnected socket (player data kept for reconnection)
          warfaireGame.unregisterSocket(socket.id);

          // Use game's broadcast method to notify remaining players
          (warfaireGame as any).broadcastGameState();
        }
      }
    }
    
    socketIdToPlayer.delete(socket.id);
    broadcastLobbyState();
    maybeStartOrResetCountdown();
  });
});

// Serve static files in production (AFTER API routes to avoid conflicts)
if (process.env.NODE_ENV === 'production') {
  // Serve frontend static files with cache-busting
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath, {
    setHeaders: (res, filePath) => {
      // Set correct MIME types
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      }
      
      // DISABLE ALL CACHING FOR DEBUGGING - this was causing constant deployment issues
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      // TODO: Re-enable selective caching later for production performance
      // Cache assets with hash in filename for 1 year
      // if (filePath.includes('-') && (filePath.endsWith('.js') || filePath.endsWith('.css'))) {
      //   res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      // }
    }
  }));
  
  // Catch-all route for SPA (must be AFTER static files)
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces for external access
httpServer.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[backend] local network access: http://192.168.86.28:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`🔍 DEBUG: Reconnection and advanceTurn logging enabled (v2025.09.10)`);
  
  // Recover any table bankrolls left from server crashes
  // recoverTableBankrolls(); // TEMPORARILY DISABLED - database schema mismatch
});

function advanceTurn(): void {
  if (!gameState) return;
  
  const activePlayers = gameState.seats.filter(s => !s.hasFolded && !s.isAllIn);
  if (activePlayers.length <= 1) {
    // Only one player left who can act, end betting round
    gameState.bettingRoundComplete = true;
    return;
  }
  
  const currentIndex = activePlayers.findIndex(s => s.playerId === gameState?.currentTurnPlayerId);
  console.log(`🎯 advanceTurn: currentTurnPlayerId=${gameState?.currentTurnPlayerId?.slice(0,6)}, found at index=${currentIndex}, activePlayers=${activePlayers.map(p => `${p.name}(${p.playerId?.slice(0,6)}):acted=${p.hasActed}`).join(', ')}`);
  
  let nextIndex = (currentIndex + 1) % activePlayers.length;
  
  // Find next player who hasn't acted yet (and isn't all-in)
  let attempts = 0;
  while (attempts < activePlayers.length) {
    const nextPlayer = activePlayers[nextIndex];
    
    if (nextPlayer) {
      // Calculate how much this player owes after edge tier discounts
      const fullAmountOwed = gameState.currentBet - (nextPlayer.currentBet || 0);
      const discountedAmountOwed = applyEdgeTierMultiplier(fullAmountOwed, nextPlayer, gameState);
      const roundedAmountOwed = applyBettingRounding(discountedAmountOwed);
      const actualAmountOwed = Math.min(roundedAmountOwed, nextPlayer.tableStack);
      
      // Player needs to act if they haven't acted yet OR they still owe money (considering discounts)
      const needsToAct = !nextPlayer.hasActed || actualAmountOwed > 0;
      
      if (needsToAct) {
        console.log(`🎯 advanceTurn: Setting turn to ${nextPlayer.name}(${nextPlayer.playerId?.slice(0,6)}) - hasActed:${nextPlayer.hasActed}, actualAmountOwed:${actualAmountOwed}`);
        gameState.currentTurnPlayerId = nextPlayer.playerId;
        // Refresh timer for the new player's turn (30 seconds)
        if (gameState.phase.includes('Bet')) {
          gameState.phaseEndsAtMs = Date.now() + getPhaseTimeout('betting');
        }
        return;
      }
    }
    nextIndex = (nextIndex + 1) % activePlayers.length;
    attempts++;
  }
  
  // All players have acted and matched the current bet, round is complete
  gameState.bettingRoundComplete = true;
}

function evaluateHandStrength(dice: Die[], phase: string): number {
  const values = dice.map(d => d.value);
  
  // Count dice by value for role evaluation
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused, 1-6 for die values
  for (const value of values) {
    if (value >= 1 && value <= 6) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  
  const sixes = counts[6] || 0;
  const fives = counts[5] || 0;
  const fours = counts[4] || 0;
  const threes = counts[3] || 0;
  const twos = counts[2] || 0;
  const ones = counts[1] || 0;
  
  let strength = 0;
  
  // Role strength evaluation (0-6 scale)
  // Strong role potential gets higher scores
  if (sixes >= 3) strength += 6; // Very strong Ship
  else if (sixes >= 2) strength += 4; // Good Ship potential
  else if (sixes >= 1) strength += 2; // Some Ship potential
  
  if (fives >= 3) strength += 5; // Strong Captain
  else if (fives >= 2) strength += 3; // Good Captain potential
  else if (fives >= 1) strength += 1.5; // Some Captain potential
  
  if (fours >= 3) strength += 4; // Strong Crew
  else if (fours >= 2) strength += 2; // Good Crew potential
  else if (fours >= 1) strength += 1; // Some Crew potential
  
  // Cargo potential (lower priority but still valuable)
  const maxCargo = Math.max(threes, twos, ones);
  if (maxCargo >= 2) strength += 1; // Good cargo potential
  else if (maxCargo >= 1) strength += 0.5; // Some cargo potential
  
  // Bonus for multiple role options (flexibility)
  const roleOptions = (sixes > 0 ? 1 : 0) + (fives > 0 ? 1 : 0) + (fours > 0 ? 1 : 0);
  if (roleOptions >= 2) strength += 1;
  
  // Phase-specific adjustments
  if (phase.includes('Roll1') || phase.includes('Lock1')) {
    // Early game: less certainty, reduce strength slightly
    strength *= 0.8;
  } else if (phase.includes('Roll3') || phase.includes('Lock3') || phase.includes('Bet3')) {
    // Late game: more certainty, slight boost
    strength *= 1.1;
  }
  
  // Clamp to 0-6 range
  return Math.max(0, Math.min(6, strength));
}

function getPossibleRoles(dice: Die[], rollsRemaining: number): string[] {
  const values = dice.map(d => d.value);
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const value of values) {
    if (value >= 1 && value <= 6) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  
  const possibleRoles: string[] = [];
  
  // Check Ship potential (6s)
  const unlockedDice = dice.filter(d => !d.locked).length;
  if ((counts[6] || 0) > 0 || (rollsRemaining > 0 && unlockedDice > 0)) {
    possibleRoles.push('Ship');
  }
  
  // Check Captain potential (5s)  
  if ((counts[5] || 0) > 0 || (rollsRemaining > 0 && unlockedDice > 0)) {
    possibleRoles.push('Captain');
  }
  
  // Check Crew potential (4s)
  if ((counts[4] || 0) > 0 || (rollsRemaining > 0 && unlockedDice > 0)) {
    possibleRoles.push('Crew');
  }
  
  // Check cargo potential
  if ((counts[3] || 0) > 0 || (counts[2] || 0) > 0 || (counts[1] || 0) > 0 || 
      (rollsRemaining > 0 && unlockedDice > 0)) {
    possibleRoles.push('Cargo3', 'Cargo2', 'Cargo1');
  }
  
  return possibleRoles;
}

function makeAILockingDecision(seat: Seat): void {
  if (!gameState || !seat.lockAllowance) return;
  
  if (!seat.aiProfile) {
    // Fallback to basic logic
    makeBasicAILockingDecision(seat);
    return;
  }
  
  const profile = seat.aiProfile;
  const rollsRemaining = getRollsRemaining(gameState.phase);
  
  // Get current dice counts
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused, 1-6 for die values
  for (const die of seat.dice) {
    if (die.value >= 1 && die.value <= 6) {
      counts[die.value] = (counts[die.value] || 0) + 1;
    }
  }
  
  // Analyze competition by checking other players' visible locked dice
  const competitionAnalysis = {
    6: 0, // Ship competition count
    5: 0, // Captain competition count  
    4: 0, // Crew competition count
    3: 0, 2: 0, 1: 0 // Cargo competition counts
  };
  
  // Count visible locked dice from other players
  for (const otherSeat of gameState.seats) {
    if (otherSeat.playerId === seat.playerId) continue; // Skip self
    for (const die of otherSeat.dice || []) {
      if (die.locked && die.isPublic && die.value >= 1 && die.value <= 6) {
        competitionAnalysis[die.value as keyof typeof competitionAnalysis]++;
      }
    }
  }
  
  // Determine target role based on priority, current dice, and competition
  let targetRole = '';
  let targetValue = 0;
  
  for (const role of profile.rolePriority) {
    let roleValue = 0;
    let hasRequiredDice = false;
    let competitorCount = 0;
    
    if (role === 'Ship') {
      roleValue = 6;
      hasRequiredDice = (counts[6] || 0) > 0;
      competitorCount = competitionAnalysis[6];
    } else if (role === 'Captain') {
      roleValue = 5;
      hasRequiredDice = (counts[5] || 0) > 0;
      competitorCount = competitionAnalysis[5];
    } else if (role === 'Crew') {
      roleValue = 4;
      hasRequiredDice = (counts[4] || 0) > 0;
      competitorCount = competitionAnalysis[4];
    } else if (role === 'Cargo3') {
      roleValue = 3;
      hasRequiredDice = (counts[3] || 0) > 0;
      competitorCount = competitionAnalysis[3];
    } else if (role === 'Cargo2') {
      roleValue = 2;
      hasRequiredDice = (counts[2] || 0) > 0;
      competitorCount = competitionAnalysis[2];
    } else if (role === 'Cargo1') {
      roleValue = 1;
      hasRequiredDice = (counts[1] || 0) > 0;
      competitorCount = competitionAnalysis[1];
    }
    
    // Strategy: prefer roles where we have dice AND low competition
    // OR if we're aggressive (high risk tolerance), pursue even without initial dice
    const shouldPursue = hasRequiredDice || 
      (profile.riskTolerance > 0.7 && competitorCount === 0 && rollsRemaining > 0);
    
    // Avoid heavily contested roles unless we're already committed
    const isHeavilyContested = competitorCount >= 2;
    const alreadyCommitted = seat.dice.filter(d => d.locked && d.value === roleValue).length > 0;
    
    if (shouldPursue && (!isHeavilyContested || alreadyCommitted)) {
      targetRole = role;
      targetValue = roleValue;
      break;
    }
  }
  
  const unlockedDice = seat.dice
    .map((die, index) => ({ die, index }))
    .filter(({ die }) => !die.locked);
  
  let locksToMake = seat.lockAllowance;
  const lockedIndices: number[] = [];
  
  // Strategy 1: Lock dice matching target role/cargo
  if (targetValue > 0) {
    const targetDice = unlockedDice.filter(({ die }) => die.value === targetValue);
    for (const { index } of targetDice) {
      if (locksToMake <= 0) break;
      seat.dice[index]!.locked = true;
      lockedIndices.push(index);
      locksToMake--;
    }
  }
  
  // Strategy 2: If we still need to lock more dice, use personality-based priority
  if (locksToMake > 0) {
    const remainingDice = unlockedDice
      .filter(({ index }) => !lockedIndices.includes(index))
      .sort((a, b) => {
        // Use the AI's role priority to determine value preferences
        const getPriorityFromProfile = (value: number) => {
          for (let i = 0; i < profile.rolePriority.length; i++) {
            const role = profile.rolePriority[i];
            if ((role === 'Ship' && value === 6) ||
                (role === 'Captain' && value === 5) ||
                (role === 'Crew' && value === 4) ||
                (role === 'Cargo3' && value === 3) ||
                (role === 'Cargo2' && value === 2) ||
                (role === 'Cargo1' && value === 1)) {
              return profile.rolePriority.length - i; // Higher priority = higher score
            }
          }
          return 0;
        };
        
        // Factor in competition - reduce priority for heavily contested values
        const getCompetitionAdjustedPriority = (value: number) => {
          const basePriority = getPriorityFromProfile(value);
          const competition = competitionAnalysis[value as keyof typeof competitionAnalysis] || 0;
          
          // Conservative players avoid competition more
          const competitionPenalty = competition * (1 - profile.riskTolerance);
          return basePriority - competitionPenalty;
        };
        
        return getCompetitionAdjustedPriority(b.die.value) - getCompetitionAdjustedPriority(a.die.value);
      });
    
    for (const { index } of remainingDice) {
      if (locksToMake <= 0) break;
      seat.dice[index]!.locked = true;
      lockedIndices.push(index);
      locksToMake--;
    }
  }
  
  // Apply mistake chance - sometimes unlock a good die or lock a bad one
  if (Math.random() < profile.mistakeChance && lockedIndices.length > 0) {
    const mistakeIndex = Math.floor(Math.random() * lockedIndices.length);
    const dieIndex = lockedIndices[mistakeIndex];
    if (dieIndex !== undefined && seat.dice[dieIndex]) {
      seat.dice[dieIndex]!.locked = false;
      
      // Find a worse die to lock instead, if available
      const unlockedBadDice = seat.dice
        .map((die, index) => ({ die, index }))
        .filter(({ die, index }) => !die.locked && die.value <= 2);
      
      if (unlockedBadDice.length > 0) {
        const badDieIndex = unlockedBadDice[0]?.index;
        if (badDieIndex !== undefined && seat.dice[badDieIndex]) {
          seat.dice[badDieIndex]!.locked = true;
        }
      }
      
      gameDebugger.logEvent('ai_mistake', seat.playerId, {
        name: seat.name,
        action: 'lock_mistake',
        unlockedValue: seat.dice[dieIndex]!.value
      });
    }
  }
  
  // Update dice visibility
  updateDicePublicVisibility(seat);
  
  // Update lock allowance
  const currentLocked = seat.dice.filter(d => d.locked).length;
  const minRequired = seat.minLocksRequired || 1;
  seat.lockAllowance = Math.max(0, minRequired - currentLocked);
  
  gameDebugger.logEvent('ai_lock_decision', seat.playerId, {
    name: seat.name,
    targetRole,
    lockedCount: currentLocked,
    minRequired,
    lockedValues: seat.dice.filter(d => d.locked).map(d => d.value),
    competition: competitionAnalysis,
    riskTolerance: profile.riskTolerance
  });
}

function makeBasicAILockingDecision(seat: Seat): void {
  if (!gameState || !seat.lockAllowance) return;
  
  // Fallback to original simple logic
  const unlockedDice = seat.dice
    .map((die, index) => ({ die, index }))
    .filter(({ die }) => !die.locked)
    .sort((a, b) => b.die.value - a.die.value);
    
  let locksToMake = seat.lockAllowance;
  for (const { index } of unlockedDice) {
    if (locksToMake <= 0) break;
    seat.dice[index]!.locked = true;
    locksToMake--;
  }
  
  updateDicePublicVisibility(seat);
  
  const currentLocked = seat.dice.filter(d => d.locked).length;
  const minRequired = seat.minLocksRequired || 1;
  seat.lockAllowance = Math.max(0, minRequired - currentLocked);
  
  gameDebugger.logEvent('ai_lock_decision', seat.playerId, {
    name: seat.name,
    lockedCount: currentLocked,
    minRequired
  });
}

function evaluateHand(dice: Die[]): HandResult {
  const values = dice.map(d => d.value);
  
  return {
    sixCount: values.filter(v => v === 6).length,
    fiveCount: values.filter(v => v === 5).length,
    fourCount: values.filter(v => v === 4).length,
    oneCount: values.filter(v => v === 1).length,
    twoCount: values.filter(v => v === 2).length,
    threeCount: values.filter(v => v === 3).length,
  };
}

function calculateSidePots(gameState: GameState): void {
  const activePlayers = gameState.seats.filter(s => !s.hasFolded);
  const sidePots: SidePot[] = [];
  
  // Sort players by their total contribution (ascending)
  const sortedPlayers = [...activePlayers].sort((a, b) => 
    (a.totalContribution || 0) - (b.totalContribution || 0)
  );
  
  let remainingPot = 0;
  let lastContribution = 0;
  
  for (let i = 0; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[i];
    if (!player) continue;
    const contribution = player.totalContribution || 0;
    
    if (contribution > lastContribution) {
      // Calculate how much this player can win from each other player
      const eligiblePlayers = sortedPlayers.slice(i).map(p => p.playerId);
      const potAmount = (contribution - lastContribution) * eligiblePlayers.length;
      
      if (potAmount > 0) {
        sidePots.push({
          amount: potAmount,
          eligiblePlayers
        });
      }
      
      lastContribution = contribution;
    }
  }
  
  if (sidePots.length > 0) {
    gameState.sidePots = sidePots;
  }
}

function calculateAnteAmount(phase?: GamePhase): number {
  const config = configService.getConfig();
  const anteConfig = config.betting.ante;

  if (anteConfig.mode === 'none') return 0;

  let baseAmount = anteConfig.amount;

  // Progressive ante: increase amount based on current betting street
  if (anteConfig.progressive && phase) {
    const streetNumber = getStreetNumber(phase);
    if (streetNumber > 0) {
      // Add street multiplier for each street after the first
      const additionalAmount = (streetNumber - 1) * anteConfig.street_multiplier;
      baseAmount = anteConfig.amount + additionalAmount;
    }
  }

  // Convert to cents (backend uses cents, config uses dollars)
  return Math.max(0, baseAmount * 100);
}

function getStreetNumber(phase: GamePhase): number {
  switch (phase) {
    case 'Ante':
    case 'Roll1':
    case 'Lock1':
    case 'Bet1':
      return 1;
    case 'Roll2':
    case 'Lock2':
    case 'Bet2':
      return 2;
    case 'Roll3':
    case 'Lock3':
    case 'Roll4':
    case 'Bet3':
      return 3;
    default:
      return 0;
  }
}

function calculateMinimumTableStack(): number {
  const config = configService.getConfig();

  let totalCost = 0;

  // 1. Ante costs (per hand)
  const anteConfig = config.betting.ante;
  if (anteConfig.mode !== 'none') {
    if (anteConfig.progressive) {
      // Progressive antes: calculate total for all 3 streets
      // Street 1: base amount
      // Street 2: base + 1 * multiplier
      // Street 3: base + 2 * multiplier
      const baseAmount = anteConfig.amount * 100; // Convert to cents
      const street2Amount = (anteConfig.amount + anteConfig.street_multiplier) * 100;
      const street3Amount = (anteConfig.amount + 2 * anteConfig.street_multiplier) * 100;

      // For 'per_player' mode, player pays ante every street
      // For other modes, assume worst case of paying ante
      if (anteConfig.mode === 'per_player') {
        totalCost += baseAmount + street2Amount + street3Amount;
      } else {
        // Conservative estimate: assume they pay the highest ante
        totalCost += street3Amount;
      }
    } else {
      // Standard ante: single payment
      const anteAmount = anteConfig.amount * 100; // Convert to cents
      totalCost += anteAmount;
    }
  }

  // 2. Potential betting costs across all 3 betting rounds
  if (config.betting.streets.enabled) {
    // If streets are enabled, maximum bet per round is defined by streets
    const s1Amount = config.betting.streets.S1 * 100; // Convert to cents
    const s2Amount = config.betting.streets.S2 * 100;
    const s3Multiplier = parseInt(config.betting.streets.s3_multiplier.replace('x', ''));
    const s3Amount = config.betting.streets.S3 * s3Multiplier * 100;

    // Sum all potential betting rounds
    totalCost += s1Amount + s2Amount + s3Amount;
  } else {
    // If streets disabled, estimate based on ante or minimum amounts
    const baseBet = anteConfig.mode !== 'none' ? anteConfig.amount * 100 : 100; // 100 cents minimum
    // Assume 3 betting rounds with escalating amounts (conservative estimate)
    totalCost += baseBet + (baseBet * 2) + (baseBet * 3);
  }

  // 3. Potential bust fee (worst case: player gets no roles)
  if (config.bust_fee.enabled) {
    let bustFeeAmount = 0;
    switch (config.bust_fee.basis) {
      case 'S1':
        bustFeeAmount = config.betting.streets.S1 * 100;
        break;
      case 'S2':
        bustFeeAmount = config.betting.streets.S2 * 100;
        break;
      case 'S3':
        bustFeeAmount = config.betting.streets.S3 * 100;
        break;
      case 'fixed':
        bustFeeAmount = config.bust_fee.fixed_amount * 100;
        break;
      default:
        bustFeeAmount = config.betting.streets.S2 * 100; // Default to S2
    }
    totalCost += bustFeeAmount;
  }

  // Round up to nearest dollar for user-friendly minimums
  return Math.ceil(totalCost / 100) * 100;
}

function calculateRequiredTableStack(): number {
  const config = configService.getConfig();
  const minimumTableStack = calculateMinimumTableStack();
  return Math.ceil(minimumTableStack * config.table.tableMinimumMultiplier);
}

function applyBettingRounding(amount: number): number {
  const config = configService.getConfig();
  const roundingUnit = config.betting.rounding * 100; // Convert dollars to cents
  
  if (roundingUnit <= 1) return Math.floor(amount); // No rounding needed
  
  return Math.round(amount / roundingUnit) * roundingUnit;
}

function getPhaseTimeout(phaseType: 'lock' | 'betting' | 'turn'): number {
  const config = configService.getConfig();
  const timingConfig = config.timing || {
    phase_timers: {
      lock_phase_seconds: 30,
      betting_phase_seconds: 30,
      turn_timeout_seconds: 30
    },
    delays: { auto_start_seconds: 3, payout_display_seconds: 3, showdown_display_seconds: 8, hand_end_seconds: 3, countdown_seconds: 5 },
    session: { max_age_days: 7, reconnect_timeout_minutes: 2 }
  };
  
  switch (phaseType) {
    case 'lock': return timingConfig.phase_timers.lock_phase_seconds * 1000;
    case 'betting': return timingConfig.phase_timers.betting_phase_seconds * 1000;
    case 'turn': return timingConfig.phase_timers.turn_timeout_seconds * 1000;
    default: return 30000; // 30 second fallback
  }
}

function getGameDelay(delayType: 'auto_start' | 'payout_display' | 'showdown_display' | 'hand_end' | 'countdown'): number {
  const config = configService.getConfig();
  const timingConfig = config.timing || {
    phase_timers: { lock_phase_seconds: 30, betting_phase_seconds: 30, turn_timeout_seconds: 30 },
    delays: {
      auto_start_seconds: 3,
      payout_display_seconds: 3,
      showdown_display_seconds: 8,
      hand_end_seconds: 3,
      countdown_seconds: 5
    },
    session: { max_age_days: 7, reconnect_timeout_minutes: 2 }
  };
  
  switch (delayType) {
    case 'auto_start': return timingConfig.delays.auto_start_seconds * 1000;
    case 'payout_display': return timingConfig.delays.payout_display_seconds * 1000;
    case 'showdown_display': return timingConfig.delays.showdown_display_seconds * 1000;
    case 'hand_end': return timingConfig.delays.hand_end_seconds * 1000;
    case 'countdown': return timingConfig.delays.countdown_seconds * 1000;
    default: return 3000; // 3 second fallback
  }
}

function getHistoryLimit(limitType: 'max_stored' | 'recent_display'): number {
  const config = configService.getConfig();
  const displayConfig = config.display || {
    history: {
      max_hands_stored: 100,
      recent_display_count: 20
    }
  };
  
  switch (limitType) {
    case 'max_stored': return displayConfig.history.max_hands_stored;
    case 'recent_display': return displayConfig.history.recent_display_count;
    default: return limitType === 'max_stored' ? 100 : 20;
  }
}

function calculateEdgeTier(seat: any, gameState: GameState): 'behind' | 'co' | 'leader' | 'dominant' {
  const config = configService.getConfig();
  
  if (!config.betting.edge_tiers.enabled) {
    return 'leader'; // Default to no discount when disabled
  }
  
  // Count revealed dice for this player (locked dice are revealed)
  const playerSixes = seat.dice.filter((d: any) => d.locked && d.value === 6).length;
  const playerFives = seat.dice.filter((d: any) => d.locked && d.value === 5).length;  
  const playerFours = seat.dice.filter((d: any) => d.locked && d.value === 4).length;
  
  // Get max counts across all active players
  const activePlayers = gameState.seats.filter(s => !s.hasFolded);
  const maxSixes = Math.max(...activePlayers.map(s => 
    s.dice.filter((d: any) => d.locked && d.value === 6).length
  ));
  const maxFives = Math.max(...activePlayers.map(s => 
    s.dice.filter((d: any) => d.locked && d.value === 5).length
  ));
  const maxFours = Math.max(...activePlayers.map(s => 
    s.dice.filter((d: any) => d.locked && d.value === 4).length
  ));
  
  // Determine position in each role
  const isLeadingShip = playerSixes > 0 && playerSixes === maxSixes;
  const isLeadingCaptain = playerFives > 0 && playerFives === maxFives;
  const isLeadingCrew = playerFours > 0 && playerFours === maxFours;
  
  const isTiedShip = playerSixes > 0 && playerSixes === maxSixes && 
    activePlayers.filter(s => s.dice.filter((d: any) => d.locked && d.value === 6).length === maxSixes).length > 1;
  const isTiedCaptain = playerFives > 0 && playerFives === maxFives && 
    activePlayers.filter(s => s.dice.filter((d: any) => d.locked && d.value === 5).length === maxFives).length > 1;
  const isTiedCrew = playerFours > 0 && playerFours === maxFours && 
    activePlayers.filter(s => s.dice.filter((d: any) => d.locked && d.value === 4).length === maxFours).length > 1;
  
  // Count how many roles player is leading/tied for
  let leadingRoles = 0;
  let tiedRoles = 0;
  
  if (isLeadingShip && !isTiedShip) leadingRoles++;
  if (isLeadingCaptain && !isTiedCaptain) leadingRoles++;  
  if (isLeadingCrew && !isTiedCrew) leadingRoles++;
  
  if (isTiedShip) tiedRoles++;
  if (isTiedCaptain) tiedRoles++;
  if (isTiedCrew) tiedRoles++;
  
  // Determine tier
  if (leadingRoles >= 2) return 'dominant';  // Leading in 2+ roles
  if (leadingRoles === 1) return 'leader';   // Leading in exactly 1 role
  if (tiedRoles > 0) return 'co';           // Tied for best in any role
  return 'behind';                          // Not best in any role
}

function applyEdgeTierMultiplier(baseAmount: number, seat: any, gameState: GameState): number {
  const config = configService.getConfig();
  
  if (!config.betting.edge_tiers.enabled) {
    return baseAmount; // No modification when disabled
  }
  
  const tier = calculateEdgeTier(seat, gameState);
  const multiplier = config.betting.edge_tiers[tier];
  
  return Math.floor(baseAmount * multiplier);
}

function calculateBaseBet(gameState: GameState): number {
  // Base bet is derived from ante amount or minimum pot contribution
  // If no ante, use 1% of current pot or 100 cents minimum
  const config = configService.getConfig();
  const anteAmount = calculateAnteAmount();
  
  if (anteAmount > 0) {
    return anteAmount; // Use ante as base bet
  }
  
  // Fallback: 1% of pot or 100 cents minimum
  return Math.max(100, Math.floor(gameState.pot * 0.01));
}

function getStreetMultiplier(gameState: GameState): number {
  const config = configService.getConfig();
  
  if (!config.betting.streets.enabled) {
    return 1; // No street limits when disabled
  }
  
  // Determine current street based on game phase
  switch (gameState.phase) {
    case 'Bet1':
      return config.betting.streets.S1;
    case 'Bet2':
      return config.betting.streets.S2;
    case 'Bet3':
      const s3Multiplier = parseInt(config.betting.streets.s3_multiplier.replace('x', ''));
      return config.betting.streets.S3 * s3Multiplier;
    default:
      return 1; // No limits outside betting phases
  }
}

function applyStreetLimits(requestedAmount: number, gameState: GameState, seat: any): number {
  const config = configService.getConfig();
  
  if (!config.betting.streets.enabled) {
    return requestedAmount; // No limits when disabled
  }
  
  const baseBet = calculateBaseBet(gameState);
  const streetMultiplier = getStreetMultiplier(gameState);
  const streetLimit = baseBet * streetMultiplier;
  
  const limitedAmount = Math.min(requestedAmount, streetLimit);
  
  if (limitedAmount !== requestedAmount) {
    console.log(`🏦 [${seat.name}] Street limit applied: ${requestedAmount} → ${limitedAmount} (${gameState.phase} limit: ${streetLimit})`);
  }
  
  return limitedAmount;
}

// Calculate theoretical rake for display (no cap applied)
function calculateDisplayRake(pot: number): number {
  const config = configService.getConfig();
  if (!config.house.rake_enabled) return 0;
  
  return Math.floor(pot * config.house.rake_percent);
}

// Calculate final rake with cap applied (for actual collection)
function calculateDavyJonesRake(pot: number, existingDisplayRake: number = 0): number {
  const config = configService.getConfig();
  if (!config.house.rake_enabled) return 0;
  
  const uncappedRake = Math.floor(pot * config.house.rake_percent);
  const totalUncappedRake = existingDisplayRake + uncappedRake;
  
  // Apply the cap to the total rake for the hand
  const cappedTotalRake = Math.min(totalUncappedRake, config.house.rake_cap);
  
  // Return the additional rake to collect (may be 0 if we hit the cap)
  return Math.max(0, cappedTotalRake - existingDisplayRake);
}

// Helper function to calculate chest awards using table configuration
function calculateChestAwardFromTableConfig(
  chestAmount: number, 
  result: LowDiceResult, 
  chestConfig: ChestConfig
): { award: number; carry: number } {
  let percentage = 0;
  
  switch (result.type) {
    case 'yahtzee':
      percentage = chestConfig.low_rank_triggers.yahtzee;
      break;
    case 'quads':
      percentage = chestConfig.low_rank_triggers.quads;
      break;
    case 'trips':
      percentage = chestConfig.low_rank_triggers.trips;
      break;
    default:
      percentage = 0;
  }
  
  const award = Math.floor(chestAmount * percentage);
  const carry = chestAmount - award;
  
  return { award, carry };
}

function calculateShowdownResults(gameState: GameState): ShowdownResult[] {
  const activePlayers = gameState.seats.filter(s => !s.hasFolded);
  
  // Calculate side pots if there are all-in players
  if (activePlayers.some(p => p.isAllIn)) {
    calculateSidePots(gameState);
  }
  
  const grossPot = gameState.pot + (gameState.carryoverPot || 0);
  
  // Calculate final rake with cap applied for actual collection
  const existingDisplayRake = gameState.displayRake || 0;
  const finalRake = calculateDavyJonesRake(grossPot, existingDisplayRake);
  gameState.davyJonesRake = finalRake;
  gameState.totalDavyJonesRake = (gameState.totalDavyJonesRake || 0) + finalRake;
  
  // Net pot after actual rake collection
  const totalPot = grossPot - finalRake;
  
  // Evaluate all hands
  const results: ShowdownResult[] = activePlayers.map(seat => ({
    playerId: seat.playerId,
    name: seat.name,
    handResult: evaluateHand(seat.dice),
    roles: [],
    payout: 0,
    isActive: true
  }));
  
  // Step 1: Assign roles based on "most dice" with uniqueness and minimum requirements
  const tableConfig = configService.getConfig();
  const roleReqs = tableConfig.payouts.role_requirements || { ship: 1, captain: 1, crew: 1 };
  
  const maxSixes = Math.max(...results.map(r => r.handResult.sixCount));
  const maxFives = Math.max(...results.map(r => r.handResult.fiveCount));  
  const maxFours = Math.max(...results.map(r => r.handResult.fourCount));
  
  // Ship = Most 6s (unique) AND meets minimum requirement
  const shipCandidates = results.filter(r => 
    r.handResult.sixCount === maxSixes && maxSixes >= roleReqs.ship
  );
  const shipWinner = shipCandidates.length === 1 ? shipCandidates[0] : null;
  
  // Captain = Most 5s (unique, not Ship) AND meets minimum requirement
  const captainCandidates = results.filter(r => 
    r.handResult.fiveCount === maxFives && maxFives >= roleReqs.captain && r !== shipWinner
  );
  const captainWinner = captainCandidates.length === 1 ? captainCandidates[0] : null;
  
  // Crew = Most 4s (unique, not Ship or Captain) AND meets minimum requirement
  const crewCandidates = results.filter(r => 
    r.handResult.fourCount === maxFours && maxFours >= roleReqs.crew && r !== shipWinner && r !== captainWinner
  );
  const crewWinner = crewCandidates.length === 1 ? crewCandidates[0] : null;
  
  // Mark role winners
  if (shipWinner) shipWinner.roles.push('Ship');
  if (captainWinner) captainWinner.roles.push('Captain');
  if (crewWinner) crewWinner.roles.push('Crew');
  
  // Track ties for display purposes
  gameState.roleTies = {
    ship: shipCandidates.length > 1 ? shipCandidates.map(c => ({ playerId: c.playerId, name: c.name, count: c.handResult.sixCount })) : null,
    captain: captainCandidates.length > 1 ? captainCandidates.map(c => ({ playerId: c.playerId, name: c.name, count: c.handResult.fiveCount })) : null,
    crew: crewCandidates.length > 1 ? crewCandidates.map(c => ({ playerId: c.playerId, name: c.name, count: c.handResult.fourCount })) : null
  };
  
  // Step 2: Initialize cargo chest and process low dice analysis for chest awards
  initializeCargoChest(gameState);
  
  // Analyze low dice for each active player for potential chest awards
  const lowDiceResults: ChestTriggerCandidate[] = results.map(result => ({
    playerId: result.playerId,
    name: result.name,
    lowDiceAnalysis: analyzeLowDice(activePlayers.find(p => p.playerId === result.playerId)?.dice || []),
    handTimestamp: Date.now() // For tiebreaking
  }));
  
  // Step 2.5: Process cargo chest triggers with tiebreaker logic
  let chestWinner: ChestTriggerCandidate | null = null;
  let chestAward = 0;
  
  if (gameState.cargoChest && gameState.cargoChest > 0) {
    const tableConfig = configService.getConfig();
    const tiebreakMode = tableConfig.chest.trigger_tiebreak || 'rank_then_time';
    
    // Resolve chest trigger winner using tiebreaker logic
    chestWinner = resolveChestTriggerTiebreaker(lowDiceResults, tiebreakMode);
    
    if (chestWinner) {
      const { award } = calculateChestAwardFromTableConfig(gameState.cargoChest, chestWinner.lowDiceAnalysis, tableConfig.chest);
      chestAward = award;
      
      // Update cargo chest
      gameState.cargoChest -= chestAward;
      if (gameState.cargoChest < 0) gameState.cargoChest = 0;
      
      // Award to winner
      const winnerResult = results.find(r => r.playerId === chestWinner!.playerId);
      if (winnerResult) {
        winnerResult.payout += chestAward;
        console.log(`🏴‍☠️ [${chestWinner.name}] Won cargo chest: ${chestAward} cents for ${chestWinner.lowDiceAnalysis.type} of ${chestWinner.lowDiceAnalysis.value}s (${chestWinner.lowDiceAnalysis.count} dice)`);
      }
    }
  }
  
  // Step 3: Calculate payouts considering side pots
  let totalToDistribute = totalPot;
  
  // If we have side pots, handle them separately
  if (gameState.sidePots && gameState.sidePots.length > 0) {
    // For each side pot, distribute among eligible players based on roles
    for (const sidePot of gameState.sidePots) {
      const eligibleResults = results.filter(r => 
        sidePot.eligiblePlayers.includes(r.playerId)
      );
      
      // Find role winners among eligible players
      const eligibleShip = eligibleResults.find(r => r.roles.includes('Ship'));
      const eligibleCaptain = eligibleResults.find(r => r.roles.includes('Captain'));
      const eligibleCrew = eligibleResults.find(r => r.roles.includes('Crew'));
      
      const config = configService.getConfig();
      let potShipPayout = Math.floor(sidePot.amount * config.payouts.role_payouts.ship);
      let potCaptainPayout = Math.floor(sidePot.amount * config.payouts.role_payouts.captain);
      let potCrewPayout = Math.floor(sidePot.amount * config.payouts.role_payouts.crew);
      
      // Distribute this side pot
      if (eligibleShip) {
        eligibleShip.payout += potShipPayout;
      } else if (eligibleCaptain) {
        potCaptainPayout += potShipPayout;
      } else if (eligibleCrew) {
        potCrewPayout += potShipPayout;
      }
      
      if (eligibleCaptain) {
        eligibleCaptain.payout += potCaptainPayout;
      } else if (eligibleShip) {
        eligibleShip.payout = (eligibleShip.payout || 0) + potCaptainPayout;
      }
      
      if (eligibleCrew) {
        eligibleCrew.payout += potCrewPayout;
      } else {
        // Crew vacant in side pot - add to main pot carryover instead of splitting among non-role players
        // This will be handled in the main pot distribution logic
      }
    }
    
    // Clear the side pots after distribution
    delete gameState.sidePots;
    
    // Return early since we handled side pots
    return results;
  }
  
  // Original payout logic for no side pots
  const payoutConfig = configService.getConfig();
  let shipPayout = Math.floor(totalPot * payoutConfig.payouts.role_payouts.ship);
  let captainPayout = Math.floor(totalPot * payoutConfig.payouts.role_payouts.captain);
  let crewPayout = Math.floor(totalPot * payoutConfig.payouts.role_payouts.crew);
  let carryover = 0;
  
  // Handle vacant roles with vacancy funnel to cargo chest
  if (!crewWinner) {
    // 50% to chest, 50% follows normal vacancy rules
    const tableConfig = configService.getConfig();
    const toChest = Math.floor(crewPayout * tableConfig.chest.unfilled_role_to_chest);
    const remainder = crewPayout - toChest;
    
    gameState.cargoChest = (gameState.cargoChest || 0) + toChest;
    gameDebugger.logEvent('vacancy_funnel', 'system', {
      role: 'Crew',
      amount: toChest,
      newChestTotal: gameState.cargoChest
    });
    
    // Crew vacancy - remainder should go to carryover, not split among non-role players
    carryover += remainder;
    crewPayout = 0;
  }
  
  if (!captainWinner) {
    // 50% to chest, 50% follows normal vacancy rules
    const tableConfig = configService.getConfig();
    const toChest = Math.floor(captainPayout * tableConfig.chest.unfilled_role_to_chest);
    const remainder = captainPayout - toChest;
    
    gameState.cargoChest = (gameState.cargoChest || 0) + toChest;
    gameDebugger.logEvent('vacancy_funnel', 'system', {
      role: 'Captain',
      amount: toChest,
      newChestTotal: gameState.cargoChest
    });
    
    if (shipWinner) {
      shipPayout += remainder;
    } else {
      carryover += remainder;
    }
    captainPayout = 0;
  }
  
  if (!shipWinner) {
    // 50% to chest, 50% follows normal vacancy rules
    const tableConfig = configService.getConfig();
    const toChest = Math.floor(shipPayout * tableConfig.chest.unfilled_role_to_chest);
    const remainder = shipPayout - toChest;
    
    gameState.cargoChest = (gameState.cargoChest || 0) + toChest;
    gameDebugger.logEvent('vacancy_funnel', 'system', {
      role: 'Ship',
      amount: toChest,
      newChestTotal: gameState.cargoChest
    });
    
    if (captainWinner && crewWinner) {
      const shipSplit = Math.floor(remainder / 2);
      captainWinner.payout += shipSplit;
      crewWinner.payout += shipSplit;
    } else if (captainWinner) {
      captainWinner.payout += remainder;
    } else if (crewWinner) {
      crewWinner.payout += remainder;
    } else {
      carryover += remainder;
    }
    shipPayout = 0;
  }
  
  // Assign role payouts
  if (shipWinner) shipWinner.payout += shipPayout;
  if (captainWinner) captainWinner.payout += captainPayout;
  if (crewWinner) crewWinner.payout += crewPayout;
  
  // Step 4: Process cargo chest awards (low dice combinations)
  gameState.chestAwards = [];
  
  // Check eligibility for each player
  const eligiblePlayers = lowDiceResults.filter(player => {
    const stamps = getPlayerStamps(player.playerId);
    const isEligible = stamps.currentCount >= cargoConfig.stamps.required;
    
    // Fresh table fallback (only if grace period enabled)
    const gracePeriodEnabled = !configService.getConfig().table.cargoChestLearningMode;
    if (!isEligible && gracePeriodEnabled && cargoConfig.stamps.fresh_table_fallback) {
      const maxStamps = Math.max(...lowDiceResults.map(p => getPlayerStamps(p.playerId).currentCount));
      return maxStamps <= cargoConfig.stamps.fresh_threshold;
    }
    
    return isEligible;
  });
  
  // Find qualifying chest awards among eligible players
  const qualifyingAwards = eligiblePlayers
    .filter(player => player.lowDiceAnalysis.type !== 'none')
    .sort((a, b) => {
      // Sort by award priority: Yahtzee > Quads > Trips
      const typeOrder = { yahtzee: 3, quads: 2, trips: 1, none: 0 };
      if (typeOrder[a.lowDiceAnalysis.type] !== typeOrder[b.lowDiceAnalysis.type]) {
        return typeOrder[b.lowDiceAnalysis.type] - typeOrder[a.lowDiceAnalysis.type];
      }
      // Same type: prefer higher value (3s > 2s > 1s)
      if (a.lowDiceAnalysis.value !== b.lowDiceAnalysis.value) {
        return b.lowDiceAnalysis.value - a.lowDiceAnalysis.value;
      }
      // Same value: prefer more total low dice
      if (a.lowDiceAnalysis.totalLowDice !== b.lowDiceAnalysis.totalLowDice) {
        return b.lowDiceAnalysis.totalLowDice - a.lowDiceAnalysis.totalLowDice;
      }
      // Random tiebreaker
      return Math.random() - 0.5;
    });
  
  // Award chest to the best qualifier (if any)
  if (qualifyingAwards.length > 0 && (gameState.cargoChest || 0) > 0) {
    const winner = qualifyingAwards[0];
    if (winner) {
      const tableConfig = configService.getConfig();
      const { award, carry } = calculateChestAwardFromTableConfig(gameState.cargoChest || 0, winner.lowDiceAnalysis, tableConfig.chest);
      
      if (award > 0) {
        // Find the player result and award them
        const playerResult = results.find(r => r.playerId === winner.playerId);
        if (playerResult) {
          const payoutBefore = playerResult.payout;
          playerResult.payout += award;
          gameState.chestAwards.push({
            playerId: winner.playerId,
            type: `${winner.lowDiceAnalysis.type} (${winner.lowDiceAnalysis.value}s)`,
            amount: award
          });

          // Log the cargo chest award
          logMoneyFlow(
            'PAYOUT_CHEST',
            winner.playerId,
            winner.name,
            'CARGO_CHEST',
            'MAIN_POT',
            award,
            `${winner.name} won ${award} pennies from cargo chest for ${winner.lowDiceAnalysis.type} (${winner.lowDiceAnalysis.value}s)`,
            {
              chestTrigger: `${winner.lowDiceAnalysis.type}_${winner.lowDiceAnalysis.value}s`,
              diceType: winner.lowDiceAnalysis.type,
              diceValue: winner.lowDiceAnalysis.value,
              diceCount: winner.lowDiceAnalysis.count,
              chestBefore: gameState.cargoChest,
              chestAfter: carry,
              payoutBefore,
              payoutAfter: playerResult.payout,
              handId: currentHandHistory?.handId,
              phase: gameState.phase
            }
          );

          gameDebugger.logEvent('chest_award', winner.playerId, {
            name: winner.name,
            type: winner.lowDiceAnalysis.type,
            value: winner.lowDiceAnalysis.value,
            count: winner.lowDiceAnalysis.count,
            award: award,
            chestBefore: gameState.cargoChest,
            chestAfter: carry
          });
        }
      }
      
      // Update chest with carry amount
      gameState.cargoChest = carry;
    }
  }
  
  // Store role assignments and carryover for next hand
  if (!gameState.roleAssignments) gameState.roleAssignments = {};
  gameState.roleAssignments.ship = shipWinner?.playerId;
  gameState.roleAssignments.captain = captainWinner?.playerId;
  gameState.roleAssignments.crew = crewWinner?.playerId;
  gameState.carryoverPot = carryover;
  
  // Step 5: Process bust fee for players with no roles
  if (payoutConfig.bust_fee.enabled) {
    const noRolePlayers = results.filter(r => r.roles.length === 0);
    
    for (const player of noRolePlayers) {
      let bustFeeAmount = 0;
      
      // Calculate bust fee based on configured basis
      switch (payoutConfig.bust_fee.basis) {
        case 'S1':
          bustFeeAmount = payoutConfig.betting.streets.S1 * 100; // Convert to cents
          break;
        case 'S2':
          bustFeeAmount = payoutConfig.betting.streets.S2 * 100; // Convert to cents
          break;
        case 'S3':
          bustFeeAmount = payoutConfig.betting.streets.S3 * 100; // Convert to cents
          break;
        case 'fixed':
          bustFeeAmount = payoutConfig.bust_fee.fixed_amount * 100; // Convert to cents
          break;
        default:
          bustFeeAmount = payoutConfig.betting.streets.S2 * 100; // Default to S2
      }
      
      // Deduct bust fee from player's payout (can go negative)
      player.payout -= bustFeeAmount;

      // Note: Actual bust fee deduction and logging happens in payout application
      console.log(`💸 [${player.name}] Bust fee calculated: ${bustFeeAmount} pennies (basis: ${payoutConfig.bust_fee.basis})`);;

      // Add bust fee to appropriate destination
      if (payoutConfig.bust_fee.to === 'chest') {
        const chestBefore = gameState.cargoChest || 0;
        gameState.cargoChest = (gameState.cargoChest || 0) + bustFeeAmount;
        gameDebugger.logEvent('bust_fee_to_chest', player.playerId, {
          name: player.name,
          fee: bustFeeAmount,
          newChestTotal: gameState.cargoChest
        });

        // Log the chest accumulation
        logMoneyFlow(
          'CHEST_DRIP',
          'system',
          'System',
          'HOUSE_RAKE',
          'CARGO_CHEST',
          bustFeeAmount,
          `Bust fee added to cargo chest: ${bustFeeAmount} pennies`,
          {
            chestBefore,
            chestAfter: gameState.cargoChest,
            source: 'bust_fee',
            handId: currentHandHistory?.handId,
            phase: gameState.phase
          }
        );
      } else {
        // Add to house rake total
        gameState.totalDavyJonesRake = (gameState.totalDavyJonesRake || 0) + bustFeeAmount;
        gameDebugger.logEvent('bust_fee_to_house', player.playerId, {
          name: player.name,
          fee: bustFeeAmount,
          totalHouseRake: gameState.totalDavyJonesRake
        });
      }
      
      console.log(`💸 [${player.name}] Bust fee applied: ${bustFeeAmount} cents (basis: ${payoutConfig.bust_fee.basis}) -> ${payoutConfig.bust_fee.to}`);
    }
  }
  
  // Slide stamps window for all active players (award stamp for this hand if they participated)
  for (const player of activePlayers) {
    const stamps = getPlayerStamps(player.playerId);
    // Slide window and award stamp based on participation
    stamps.stamps.shift();
    
    // Check if player participated in this hand (made any bets/calls/raises)
    const participated = (player.totalContribution || 0) > 0;
    console.log(`🎯 [${player.name}] Checking participation: totalContribution=${player.totalContribution || 0}, participated=${participated}`);
    stamps.stamps.push(participated);
    stamps.currentCount = stamps.stamps.filter(s => s).length;
    
    if (participated) {
      console.log(`🏆 [${player.name}] AWARDED STAMP! New stamp count: ${stamps.currentCount}`);
      gameDebugger.logEvent('stamp_awarded', player.playerId, {
        name: player.name,
        contribution: player.totalContribution || 0,
        newStampCount: stamps.currentCount
      });
    } else {
      console.log(`❌ [${player.name}] No stamp awarded (no participation)`);
    }
  }
  
  return results;
}

function calculateChestExpectedValue(seat: Seat): number {
  if (!gameState || !seat.dice) return 0;
  
  const stamps = getPlayerStamps(seat.playerId);
  const maxStamps = Math.max(...gameState.seats.map(s => getPlayerStamps(s.playerId).currentCount));
  
  // Check eligibility
  const tableConfig = configService.getConfig();
  const gracePeriodEnabled = !tableConfig.table.cargoChestLearningMode;
  const isEligible = stamps.currentCount >= cargoConfig.stamps.required || 
    (gracePeriodEnabled && cargoConfig.stamps.fresh_table_fallback && maxStamps <= cargoConfig.stamps.fresh_threshold);
  
  if (!isEligible) return 0;
  
  const chestSize = gameState.cargoChest || 0;
  if (chestSize === 0) return 0;
  
  // Analyze low dice potential
  const lowDiceAnalysis = analyzeLowDice(seat.dice);
  
  // Estimate probability and award based on current hand
  let probability = 0;
  let award = 0;
  
  switch (lowDiceAnalysis.type) {
    case 'yahtzee':
      probability = 0.8; // High confidence for existing yahtzee
      award = Math.floor(chestSize * tableConfig.chest.low_rank_triggers.yahtzee);
      break;
    case 'quads':
      probability = 0.6; // Good chance of winning with quads
      award = Math.floor(chestSize * tableConfig.chest.low_rank_triggers.quads);
      break;
    case 'trips':
      probability = 0.3; // Lower chance, might face better hands
      award = Math.floor(chestSize * tableConfig.chest.low_rank_triggers.trips);
      break;
    default:
      // No current combination, estimate based on low dice count
      const lowDiceCount = lowDiceAnalysis.totalLowDice;
      if (lowDiceCount >= 3) {
        probability = 0.1; // Small chance of improving to trips+
        award = Math.floor(chestSize * tableConfig.chest.low_rank_triggers.trips);
      }
  }
  
  return probability * award;
}

function makeAIBettingDecision(seat: Seat): void {
  if (!gameState || !seat.aiProfile) {
    // Fallback to old logic if no profile
    makeBasicAIBettingDecision(seat);
    return;
  }
  
  const profile = seat.aiProfile;
  let handStrength = evaluateHandStrength(seat.dice, gameState.phase);
  const possibleRoles = getPossibleRoles(seat.dice, getRollsRemaining(gameState.phase));
  
  // Factor in chest expected value
  const chestEV = calculateChestExpectedValue(seat);
  if (chestEV > 0) {
    // Add chest EV bonus to hand strength (scaled appropriately)
    const chestBonus = Math.min(1.5, chestEV / (gameState.pot || 100)); // Cap bonus at 1.5
    handStrength += chestBonus;
  }
  
  // Apply bluff modifier
  if (Math.random() < profile.bluffFrequency) {
    handStrength += 2; // Act stronger than actual hand
    gameDebugger.logEvent('ai_bluff', seat.playerId, { 
      name: seat.name, 
      originalStrength: handStrength - 2,
      bluffStrength: handStrength 
    });
  }
  
  // Apply mistake modifier  
  if (Math.random() < profile.mistakeChance) {
    handStrength -= 1; // Act weaker than actual hand
    gameDebugger.logEvent('ai_mistake', seat.playerId, { 
      name: seat.name, 
      originalStrength: handStrength + 1,
      mistakeStrength: handStrength 
    });
  }
  
  const fullAmountToCall = gameState.currentBet - (seat.currentBet || 0);
  const amountToCall = applyEdgeTierMultiplier(fullAmountToCall, seat, gameState);
  
  // Log edge tier application for AI
  if (amountToCall !== fullAmountToCall) {
    const tier = calculateEdgeTier(seat, gameState);
    console.log(`🤖 [${seat.name}] AI edge tier ${tier}: ${fullAmountToCall} → ${amountToCall} (${Math.round((amountToCall/fullAmountToCall)*100)}%)`);
  }
  
  // Decision logic based on profile
  if (handStrength < profile.foldThreshold) {
    // Weak hand - consider folding based on risk tolerance
    if (Math.random() > profile.riskTolerance || amountToCall > seat.tableStack * 0.2) {
      seat.hasFolded = true;
      seat.hasActed = true;
      gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
        name: seat.name,
        action: 'fold',
        reason: `hand_strength: ${handStrength.toFixed(1)}, threshold: ${profile.foldThreshold}`,
        chestEV: chestEV.toFixed(0)
      });
      return;
    }
  }
  
  if (amountToCall === 0) {
    // No amount to call - decide between check and bet
    if (handStrength >= profile.foldThreshold + 2 && Math.random() < profile.riskTolerance) {
      // Strong hand - consider betting
      const betAmount = Math.round(gameState.pot * profile.raiseMultiplier * 0.1);
      const streetLimitedBet = applyStreetLimits(betAmount, gameState, seat);
      const actualBet = Math.min(streetLimitedBet, seat.tableStack);
      
      // Handle all-in
      if (actualBet >= seat.tableStack) {
        seat.isAllIn = true;
      }
      
      // Process drip to cargo chest
      const { mainPot: mainPotAmount } = processDripFromWager(gameState, actualBet);
      gameState.pot += mainPotAmount;

      gameState.currentBet = actualBet;
      gameState.bettingRoundCount = (gameState.bettingRoundCount || 0) + 1; // Track AI bets

      const startingBankroll = seat.tableStack;
      seat.tableStack -= actualBet;
      seat.currentBet = actualBet;
      seat.totalContribution = (seat.totalContribution || 0) + actualBet;
      console.log(`🎯 [${seat.name}] Updated totalContribution during bet: +${actualBet} = ${seat.totalContribution}`);
      seat.hasActed = true;

      // Log AI bet to money flow service
      logMoneyFlow(
        'BET',
        seat.playerId,
        seat.name,
        'TABLE_STACK',
        'MAIN_POT',
        actualBet,
        `${seat.name} bet ${actualBet} pennies (from ${startingBankroll} to ${seat.tableStack})`
      );
      
      gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
        name: seat.name,
        action: 'bet',
        amount: actualBet,
        handStrength: handStrength.toFixed(1),
        chestEV: chestEV.toFixed(0)
      });
    } else {
      // Check
      seat.currentBet = gameState.currentBet; // Match current bet when checking
      seat.hasActed = true;
      gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
        name: seat.name,
        action: 'check',
        handStrength: handStrength.toFixed(1),
        chestEV: chestEV.toFixed(0)
      });
    }
  } else {
    // Amount to call - decide call vs raise vs fold
    const maxRaisesPerRound = 4; // Limit raises to prevent infinite loops
    const currentRaises = gameState.bettingRoundCount || 0;
    
    if (handStrength >= profile.foldThreshold + 3 && 
        Math.random() < profile.riskTolerance * 0.7 && 
        amountToCall < seat.tableStack * 0.3 &&
        currentRaises < maxRaisesPerRound) { // Add raise limit check
      // Strong hand - consider raising
      const raiseAmount = Math.round(gameState.pot * profile.raiseMultiplier * 0.15);
      const streetLimitedRaise = applyStreetLimits(raiseAmount, gameState, seat);
      const totalAmount = amountToCall + streetLimitedRaise;
      const actualAmount = Math.min(totalAmount, seat.tableStack);
      
      // Handle all-in
      if (actualAmount >= seat.tableStack) {
        seat.isAllIn = true;
        // If going all-in, adjust the current bet appropriately
        const actualRaise = Math.max(0, seat.tableStack - amountToCall);
        if (actualRaise > 0) {
          gameState.currentBet = (seat.currentBet || 0) + amountToCall + actualRaise;
        }
      } else {
        gameState.currentBet += raiseAmount;
      }
      
      gameState.bettingRoundCount = (gameState.bettingRoundCount || 0) + 1; // Track AI raises
      
      // Process drip to cargo chest
      const { mainPot: mainPotAmount } = processDripFromWager(gameState, actualAmount);
      gameState.pot += mainPotAmount;

      const startingBankroll = seat.tableStack;
      seat.tableStack -= actualAmount;
      seat.currentBet = Math.min(gameState.currentBet, (seat.currentBet || 0) + actualAmount);
      seat.totalContribution = (seat.totalContribution || 0) + actualAmount;
      console.log(`🎯 [${seat.name}] Updated totalContribution during ante bet: +${actualAmount} = ${seat.totalContribution}`);
      seat.hasActed = true;

      // Log AI raise to money flow service
      logMoneyFlow(
        'RAISE',
        seat.playerId,
        seat.name,
        'TABLE_STACK',
        'MAIN_POT',
        actualAmount,
        `${seat.name} raised ${actualAmount} pennies (from ${startingBankroll} to ${seat.tableStack})`
      );
      
      gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
        name: seat.name,
        action: 'raise',
        amount: actualAmount,
        handStrength: handStrength.toFixed(1),
        chestEV: chestEV.toFixed(0)
      });
    } else {
      // Call
      const actualCallAmount = Math.min(amountToCall, seat.tableStack);
      
      // Handle all-in
      if (actualCallAmount >= seat.tableStack) {
        seat.isAllIn = true;
      }
      
      // Process drip to cargo chest
      const { mainPot: mainPotAmount } = processDripFromWager(gameState, actualCallAmount);
      gameState.pot += mainPotAmount;

      const startingBankroll = seat.tableStack;
      seat.tableStack -= actualCallAmount;
      seat.currentBet = (seat.currentBet || 0) + actualCallAmount;
      seat.totalContribution = (seat.totalContribution || 0) + actualCallAmount;
      console.log(`🎯 [${seat.name}] Updated totalContribution during call: +${actualCallAmount} = ${seat.totalContribution}`);
      seat.hasActed = true;
      recordHandAction(seat.playerId, 'call', actualCallAmount);
      recordBetAction(seat.playerId, 'call', actualCallAmount);

      // Log AI call to money flow service
      logMoneyFlow(
        'CALL',
        seat.playerId,
        seat.name,
        'TABLE_STACK',
        'MAIN_POT',
        actualCallAmount,
        `${seat.name} called ${actualCallAmount} pennies (from ${startingBankroll} to ${seat.tableStack})`
      );
      
      gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
        name: seat.name,
        action: seat.isAllIn ? 'all-in' : 'call',
        amount: actualCallAmount,
        handStrength: handStrength.toFixed(1),
        chestEV: chestEV.toFixed(0)
      });
    }
  }
}

function getRollsRemaining(phase: string): number {
  if (phase.includes('Roll1') || phase.includes('Lock1')) return 2;
  if (phase.includes('Roll2') || phase.includes('Lock2')) return 1; 
  if (phase.includes('Roll3') || phase.includes('Lock3')) return 1;
  if (phase.includes('Roll4')) return 0;
  return 0;
}

function makeBasicAIBettingDecision(seat: Seat): void {
  // Fallback to original simple logic
  if (!gameState) return;
  
  const lockedDice = seat.dice.filter(d => d.locked);
  const averageDiceValue = lockedDice.length > 0 ? 
    lockedDice.reduce((sum, die) => sum + die.value, 0) / lockedDice.length : 0;
    
  if (averageDiceValue < 3 && Math.random() < 0.5) {
    seat.hasFolded = true;
    seat.hasActed = true;
    gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
      name: seat.name,
      action: 'fold',
      reason: 'basic_ai_low_average'
    });
    return;
  }
  
  const fullAmountToCall = gameState.currentBet - (seat.currentBet || 0);
  const amountToCall = applyEdgeTierMultiplier(fullAmountToCall, seat, gameState);
  
  // Log edge tier application for AI
  if (amountToCall !== fullAmountToCall) {
    const tier = calculateEdgeTier(seat, gameState);
    console.log(`🤖 [${seat.name}] AI edge tier ${tier}: ${fullAmountToCall} → ${amountToCall} (${Math.round((amountToCall/fullAmountToCall)*100)}%)`);
  }
  
  if (amountToCall === 0) {
    seat.hasActed = true;
    gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
      name: seat.name,
      action: 'check'
    });
  } else {
    gameState.pot += amountToCall;
    seat.tableStack = Math.max(0, seat.tableStack - amountToCall);
    seat.currentBet = gameState.currentBet;
    seat.hasActed = true;
    gameDebugger.logEvent('ai_bet_decision', seat.playerId, {
      name: seat.name,
      action: 'call',
      amount: amountToCall
    });
  }
}

function createAiPlayer(): Player {
  const id = generateAiId();
  
  // Generate unique AI name by checking existing players
  let baseName: string;
  if (aiProfiles.length > 0) {
    baseName = aiProfiles[Math.floor(Math.random() * aiProfiles.length)]?.name || generateAiName();
  } else {
    baseName = generateAiName();
  }
  
  // Ensure name uniqueness by checking all existing players
  let uniqueName = baseName;
  let suffix = 1;
  const existingNames = [
    ...Array.from(socketIdToPlayer.values()).map(p => p.name),
    ...aiPlayers.map(p => p.name),
    ...getSeatedPlayers().map(p => p.name)
  ];
  
  while (existingNames.includes(uniqueName)) {
    suffix++;
    uniqueName = `${baseName} ${suffix}`;
  }
  
  // Random cosmetics for AI players - simplified  
  const diceOptions = ['bone', 'pearl', 'brass', 'ebony', 'seaglass', 'obsidian'];
  const randomIndex = Math.floor(Math.random() * diceOptions.length);
  const randomDice = diceOptions[randomIndex] || 'bone';
  
  return {
    id,
    name: uniqueName,
    isAI: true,
    bankroll: 5000, // 50 gold coins in pennies
    cosmetics: {
      banner: 'classic',
      emblem: 'none',
      title: 'none',
      highSkin: 'bone-classic',
      lowSkin: 'pearl-simple'
    }
  };
}

function generateAiId(): string {
  let id: string;
  do {
    id = `AI-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  } while (
    socketIdToPlayer.has(id) || aiPlayers.some((p) => p.id === id)
  );
  return id;
}

function generateAiName(): string {
  const names = ['Bosun', 'Gunner', 'Quartermaster', 'Navigator', 'Cook', 'Deckhand'];
  const name = names[Math.floor(Math.random() * names.length)];
  return `${name} ${Math.floor(Math.random() * 90) + 10}`;
}

function createEmptyDiceSet(): Die[] {
  return new Array(5).fill(null).map(() => ({ value: 0, locked: false, isPublic: false }));
}

function updateDicePublicVisibility(seat: Seat): void {
  // Don't reset dice that are already public from previous rounds
  // Only update visibility when all players have finished locking in this phase
  if (!gameState?.allLockingComplete) {
    return; // Keep existing visibility until everyone is done locking
  }
  
  // Get the minimum required locks for this round
  const minRequired = seat.minLocksRequired || 1;
  
  // Get locked dice sorted by value (descending) to show the highest values
  const lockedDice = seat.dice
    .map((die, index) => ({ die, index }))
    .filter(item => item.die.locked)
    .sort((a, b) => b.die.value - a.die.value);
  
  // Mark the top N locked dice as public (where N is minimum required)
  // This preserves previously public dice and reveals new ones up to the required amount
  for (let i = 0; i < Math.min(minRequired, lockedDice.length); i++) {
    const lockedItem = lockedDice[i];
    if (lockedItem) {
      lockedItem.die.isPublic = true;
    }
  }
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function nextPhase(current: GamePhase): GamePhase {
  const order: GamePhase[] = ['Ante', 'Roll1', 'Lock1', 'Bet1', 'Roll2', 'Lock2', 'Bet2', 'Roll3', 'Lock3', 'Roll4', 'Bet3', 'Showdown', 'Payout', 'HandEnd'];
  const idx = order.indexOf(current);
  if (idx < 0) return 'PreHand';
  return order[Math.min(order.length - 1, idx + 1)] as GamePhase;
}

function recordHandAction(playerId: string, action: string, amount?: number, dice?: number[]): void {
  if (!currentHandHistory || !gameState) return;
  
  const player = gameState.seats.find(s => s.playerId === playerId);
  const playerName = player?.name || 'Unknown';
  
  // Find or create phase entry
  let phaseEntry = currentHandHistory.phases.find(p => p.phase === gameState!.phase);
  if (!phaseEntry) {
    phaseEntry = {
      phase: gameState!.phase,
      timestamp: new Date().toISOString(),
      actions: []
    };
    currentHandHistory.phases.push(phaseEntry);
  }
  
  const actionEntry: any = {
    playerId,
    playerName,
    action
  };
  if (amount !== undefined) actionEntry.amount = amount;
  if (dice !== undefined) actionEntry.dice = dice;
  phaseEntry.actions.push(actionEntry);
}

function saveHandHistory(): void {
  if (!currentHandHistory) return;
  
  // Update final player states
  if (gameState && currentHandHistory) {
    const histRef = currentHandHistory; // Capture for type safety
    histRef.players = gameState.seats.map(s => {
      const result = gameState!.showdownResults?.find(r => r.playerId === s.playerId);
      const playerData: any = {
        name: s.name,
        isAI: s.isAI,
        startingBankroll: histRef.players.find(p => p.name === s.name)?.startingBankroll || 0,
        endingBankroll: s.tableStack,
        finalDice: s.dice.map(d => d.value || 0)
      };
      if (result?.roles) {
        playerData.role = result.roles.join(', ');
      }
      return playerData;
    });
    
    histRef.pot = gameState.pot;
    histRef.winners = gameState.showdownResults
      ?.filter(r => r.payout > 0)
      .map(r => r.name) || [];
    histRef.cargoChest = gameState.cargoChest || 0;
  }
  
  // Add to history
  handHistory.push(currentHandHistory);
  
  // Trim history if needed
  const maxHistory = getMaxHandHistory();
  if (handHistory.length > maxHistory) {
    handHistory.splice(0, handHistory.length - maxHistory);
  }
  
  // Save to file for debugging
  const fs = require('fs');
  const path = require('path');
  const historyDir = path.join(__dirname, '..', 'hand_history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  
  const filename = `${currentHandHistory.handId}.json`;
  fs.writeFileSync(
    path.join(historyDir, filename),
    JSON.stringify(currentHandHistory, null, 2)
  );
  
  logger.log('info', 'system', `Hand history saved: ${filename}`);
  currentHandHistory = null;
}

function onEnterPhase(): void {
  if (!gameState) return;

  // Set hand ID for money flow tracking
  if (currentHandHistory) {
    moneyFlowService.setCurrentHandId(currentHandHistory.handId);
    recordHandAction('system', `Phase changed to ${gameState.phase}`);
  }
  
  switch (gameState.phase) {
    case 'Ante':
      // Ensure hand history is initialized at start of new hand
      if (!currentHandHistory && gameState) {
        console.log('⚠️  Missing hand history at Ante phase - initializing now');
        const players = gameState.seats.map(s => ({
          id: s.playerId,
          name: s.name,
          isAI: s.isAI,
          bankroll: s.tableStack
        } as Player));
        initializeHandHistory(players);
      }
      
      // Collect ante based on configuration
      const config = configService.getConfig();
      const anteConfig = config.betting.ante;
      
      if (anteConfig.mode !== 'none') {
        for (const s of gameState.seats) {
          let shouldPayAnte = false;
          
          switch (anteConfig.mode) {
            case 'per_player':
              shouldPayAnte = true;
              break;
            case 'button':
              // TODO: Implement button position tracking
              shouldPayAnte = s === gameState.seats[0]; // Temporary: first player pays
              break;
            case 'every_nth':
              // Pay ante every nth hand based on config
              const handNumber = gameState.handCount || 0;
              shouldPayAnte = handNumber > 0 && handNumber % anteConfig.every_nth === 0;
              break;
          }
          
          if (shouldPayAnte) {
            const currentAnteAmount = calculateAnteAmount(gameState.phase);
            const amt = Math.min(s.tableStack, currentAnteAmount);
            const beforeBalance = s.tableStack;
            s.tableStack -= amt;

            // Process drip to cargo chest for antes
            const { mainPot: mainPotAmount, chestDrip } = processDripFromWager(gameState, amt);
            gameState.pot += mainPotAmount;

            s.totalContribution = amt;
            const streetInfo = anteConfig.progressive ? ` street ${getStreetNumber(gameState.phase)}` : '';
            console.log(`🎯 [${s.name}] Paid ante: ${amt} (mode: ${anteConfig.mode}${streetInfo})`);

            // Log ante payment
            logMoneyFlow(
              'ANTE',
              s.playerId,
              s.name,
              'TABLE_STACK',
              'MAIN_POT',
              amt,
              `${s.name} paid ante ${amt} pennies (${anteConfig.mode} mode${streetInfo})`,
              {
                beforeBalance,
                afterBalance: s.tableStack,
                potBefore: gameState.pot - mainPotAmount,
                potAfter: gameState.pot,
                chestDrip,
                anteMode: anteConfig.mode,
                anteAmount: currentAnteAmount,
                streetNumber: getStreetNumber(gameState.phase),
                progressive: anteConfig.progressive
              }
            );

            // Handle all-in on ante
            if (s.tableStack === 0) {
              s.isAllIn = true;
            }
          } else {
            s.totalContribution = 0;
            console.log(`🎯 [${s.name}] No ante required (mode: ${anteConfig.mode})`);
          }
        }
      } else {
        // No ante mode - initialize totalContribution to 0
        for (const s of gameState.seats) {
          s.totalContribution = 0;
          console.log(`🎯 [${s.name}] No ante required (mode: none)`);
        }
      }
      // Move immediately to first roll
      gameState.phase = 'Roll1';
      onEnterPhase();
      break;
    case 'Roll1':
    case 'Roll2':
    case 'Roll3':
      // roll all unlocked dice for everyone
      for (const s of gameState.seats) {
        if (s.hasFolded) continue;
        s.dice = s.dice.map((d) => (d.locked ? d : { value: rollDie(), locked: false, isPublic: false }));
      }
      
      // Record the roll phase for hand history
      recordRollPhase();
      
      // Immediately move to the corresponding lock phase
      if (gameState.phase === 'Roll1') gameState.phase = 'Lock1';
      else if (gameState.phase === 'Roll2') gameState.phase = 'Lock2';
      else if (gameState.phase === 'Roll3') gameState.phase = 'Lock3';
      onEnterPhase();
      break;
    case 'Roll4':
      // Final roll after Lock3 - roll all unlocked dice for everyone
      for (const s of gameState.seats) {
        if (s.hasFolded) continue;
        s.dice = s.dice.map((d) => (d.locked ? d : { value: rollDie(), locked: false, isPublic: false }));
      }
      
      // Record the final roll phase for hand history
      recordRollPhase();
      
      // Move to final betting phase
      gameState.phase = 'Bet3';
      onEnterPhase();
      break;
    case 'Lock1':
    case 'Lock2':
    case 'Lock3':
      // Reset locking completion flag for new locking phase
      gameState.allLockingComplete = false;
      // Set lock requirements based on round (1, 2, 3 minimum locks)
      const round = parseInt(gameState.phase.slice(-1));
      const minLocksRequired = round;
      for (const s of gameState.seats) {
        if (!s.hasFolded) {
          // Count how many dice are currently locked
          const currentLocked = s.dice.filter(d => d.locked).length;
          // Players must have at least minLocksRequired locked dice
          // They can lock/unlock as needed to reach this minimum
          s.lockAllowance = Math.max(0, minLocksRequired - currentLocked);
          // Store the minimum required for this round for validation
          s.minLocksRequired = minLocksRequired;
          // Reset locking done status for new round
          s.lockingDone = false;
        }
      }
      // Set phase timer and end time (configurable seconds for dice locking)
      gameState.phaseEndsAtMs = Date.now() + getPhaseTimeout('lock');
      
      // AI players make locking decisions immediately 
      setTimeout(() => {
        if (!gameState) return;
        for (const seat of gameState.seats) {
          if (seat.isAI && !seat.hasFolded && seat.lockAllowance > 0) {
            console.log(`🤖 AI ${seat.name} making locking decision (standingUp: ${seat.standingUp})`);
            makeAILockingDecision(seat);
          } else if (seat.isAI) {
            console.log(`🤖 AI ${seat.name} not making decision: hasFolded=${seat.hasFolded}, lockAllowance=${seat.lockAllowance}`);
          }
        }
        
        // Mark AI as done and check if all are done
        for (const seat of gameState.seats) {
          if (seat.isAI && !seat.hasFolded) {
            seat.lockingDone = true;
          }
        }
        
        const allDone = gameState.seats.every((s) => {
          if (s.hasFolded) return true;
          const locked = s.dice.filter(d => d.locked).length;
          const required = s.minLocksRequired || 1;
          return locked >= required && (s.isAI || s.lockingDone);
        });
        
        if (allDone) {
          if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
          delete gameState.phaseEndsAtMs;
          gameState.allLockingComplete = true;
          
          // Record lock phase for hand history
          recordLockPhase();
          
          // Now that all locking is complete, update dice visibility for all players
          gameState.seats.forEach(seat => {
            if (!seat.hasFolded) {
              updateDicePublicVisibility(seat);
            }
          });
          
          // Broadcast the updated dice visibility before changing phase
          broadcastGameState();
          
          gameState.phase = nextPhase(gameState.phase);
          onEnterPhase();
        }
        
        broadcastGameState();
      }, 1000);
      
      // Auto-advance to betting after 30s if players don't lock
      if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
      phaseTimer = setTimeout(() => {
        if (!gameState) return;
        // Auto-lock dice for players who haven't locked enough
        for (const s of gameState.seats) {
          if (!s.hasFolded && s.lockAllowance > 0) {
            if (s.isAI) {
              makeAILockingDecision(s);
            } else {
              // Random locking for human players who didn't act in time
              const unlockedIndices = s.dice
                .map((d, i) => (!d.locked ? i : -1))
                .filter(i => i >= 0);
              while (s.lockAllowance > 0 && unlockedIndices.length > 0) {
                const randomIndex = Math.floor(Math.random() * unlockedIndices.length);
                const dieIndex = unlockedIndices[randomIndex]!;
                s.dice[dieIndex]!.locked = true;
                s.lockAllowance -= 1;
                unlockedIndices.splice(randomIndex, 1);
              }
              // Update dice visibility for random auto-locks
              updateDicePublicVisibility(s);
            }
          }
        }
        gameState.phase = nextPhase(gameState.phase);
        onEnterPhase();
        broadcastGameState();
      }, getPhaseTimeout('lock'));
      break;
    case 'Bet1':
    case 'Bet2':
    case 'Bet3':
      // Reset betting state for new round
      gameState.currentBet = 0;
      gameState.bettingRoundComplete = false;
      gameState.bettingRoundCount = 0; // Track raises this round
      for (const s of gameState.seats) {
        s.currentBet = 0;
        s.hasActed = false;
      }

      // Collect progressive ante for Bet2 and Bet3 phases
      const currentConfig = configService.getConfig();
      const currentAnteConfig = currentConfig.betting.ante;

      if (currentAnteConfig.progressive && currentAnteConfig.mode !== 'none' && (gameState.phase === 'Bet2' || gameState.phase === 'Bet3')) {
        console.log(`💰 Collecting progressive ante for ${gameState.phase} (street ${getStreetNumber(gameState.phase)})`);

        for (const s of gameState.seats) {
          let shouldPayAnte = false;

          switch (currentAnteConfig.mode) {
            case 'per_player':
              shouldPayAnte = true;
              break;
            case 'button':
              // TODO: Implement button position tracking
              shouldPayAnte = s === gameState.seats[0]; // Temporary: first player pays
              break;
            case 'every_nth':
              // Pay ante every nth hand based on config
              const handNumber = gameState.handCount || 0;
              shouldPayAnte = handNumber > 0 && handNumber % currentAnteConfig.every_nth === 0;
              break;
          }

          if (shouldPayAnte) {
            const currentAnteAmount = calculateAnteAmount(gameState.phase);
            const amt = Math.min(s.tableStack, currentAnteAmount);
            const beforeBalance = s.tableStack;
            s.tableStack -= amt;

            // Process drip to cargo chest for progressive antes
            const { mainPot: mainPotAmount, chestDrip } = processDripFromWager(gameState, amt);
            gameState.pot += mainPotAmount;

            s.totalContribution = (s.totalContribution || 0) + amt;
            const streetInfo = ` street ${getStreetNumber(gameState.phase)}`;
            console.log(`🎯 [${s.name}] Paid progressive ante: ${amt} (mode: ${currentAnteConfig.mode}${streetInfo})`);

            // Log progressive ante payment
            logMoneyFlow(
              'ANTE',
              s.playerId,
              s.name,
              'TABLE_STACK',
              'MAIN_POT',
              amt,
              `${s.name} paid progressive ante ${amt} pennies (${currentAnteConfig.mode} mode${streetInfo})`,
              {
                beforeBalance,
                afterBalance: s.tableStack,
                potBefore: gameState.pot - mainPotAmount,
                potAfter: gameState.pot,
                chestDrip,
                anteMode: currentAnteConfig.mode,
                anteAmount: currentAnteAmount,
                streetNumber: getStreetNumber(gameState.phase),
                progressive: true
              }
            );

            // Handle all-in on progressive ante
            if (s.tableStack === 0) {
              s.isAllIn = true;
              console.log(`💰 [${s.name}] All-in on progressive ante!`);
            }
          }
        }
      }

      // Set first player to act (after dealer)
      const dealerIndex = gameState.dealerSeatIndex || 0;
      const nextPlayerIndex = (dealerIndex + 1) % gameState.seats.length;
      const firstPlayer = gameState.seats.find((s, i) => i === nextPlayerIndex && !s.hasFolded);
      if (firstPlayer) {
        gameState.currentTurnPlayerId = firstPlayer.playerId;
      }
      
      // Set phase timer and end time (configurable seconds for betting)
      gameState.phaseEndsAtMs = Date.now() + getPhaseTimeout('betting');
      
      // Check for betting completion periodically
      const checkBettingComplete = () => {
        if (!gameState || gameState.bettingRoundComplete) {
          if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
          if (gameState) {
            delete gameState.phaseEndsAtMs;
            gameState.phase = nextPhase(gameState.phase);
            onEnterPhase();
          }
          broadcastGameState();
          return;
        }
        
        // Handle AI turns
        const currentPlayer = gameState.seats.find(s => s.playerId === gameState?.currentTurnPlayerId);
        if (currentPlayer?.isAI && !currentPlayer.hasFolded) {
          makeAIBettingDecision(currentPlayer);
          advanceTurn();
          broadcastGameState();
        }
        
        setTimeout(checkBettingComplete, 1000);
      };
      
      setTimeout(checkBettingComplete, 1000);
      
      // Auto-advance betting after configured time
      if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
      phaseTimer = setTimeout(() => {
        if (!gameState) return;
        gameState.phase = nextPhase(gameState.phase);
        onEnterPhase();
        broadcastGameState();
      }, getPhaseTimeout('betting'));
      break;
    case 'Showdown':
      // Calculate side pots if needed and evaluate hands
      const showdownResults = calculateShowdownResults(gameState);
      gameState.showdownResults = showdownResults;
      
      // Record showdown details for hand history
      recordShowdown();
      
      broadcastGameState();
      
      // Give time to display results
      setTimeout(() => {
        if (!gameState) return;
        gameState.phase = 'Payout';
        onEnterPhase();
        broadcastGameState();
      }, getGameDelay('showdown_display')); // Configurable time to show ceremony
      break;
    case 'Payout':
      // Distribute winnings based on showdown results and update database
      if (gameState.showdownResults) {
        for (const result of gameState.showdownResults) {
          // Update hand history with actual payout (including 0 payouts)
          if (currentHandHistory?.showdown?.payouts) {
            currentHandHistory.showdown.payouts[result.playerId] = result.payout || 0;
          }
          
          if (result.payout !== 0) {
            const seat = gameState.seats.find(s => s.playerId === result.playerId);
            if (seat) {
              const beforeBalance = seat.tableStack;

              // Handle negative payouts (bust fees) - ensure player has sufficient funds
              if (result.payout < 0) {
                const feeAmount = Math.abs(result.payout);
                const availableFunds = seat.tableStack;

                if (availableFunds < feeAmount) {
                  // Player doesn't have enough table stack to cover the fee
                  // Deduct what they have and log the shortfall
                  const actualDeduction = availableFunds;
                  const shortfall = feeAmount - actualDeduction;

                  seat.tableStack = 0; // Take all remaining funds

                  // Log the partial payment
                  logMoneyFlow(
                    'BUST_FEE',
                    seat.playerId,
                    seat.name,
                    'TABLE_STACK',
                    'HOUSE_RAKE',
                    actualDeduction,
                    `${seat.name} paid ${actualDeduction} pennies bust fee (${shortfall} pennies shortfall - insufficient table stack)`,
                    {
                      beforeBalance,
                      afterBalance: seat.tableStack,
                      requestedFee: feeAmount,
                      actualFee: actualDeduction,
                      shortfall,
                      handId: currentHandHistory?.handId,
                      phase: gameState.phase
                    }
                  );

                  // Log the shortfall for tracking
                  console.warn(`⚠️ [${seat.name}] Bust fee shortfall: requested ${feeAmount}, paid ${actualDeduction}, shortfall ${shortfall}`);

                } else {
                  // Player has sufficient funds
                  seat.tableStack += result.payout; // This subtracts the fee since payout is negative

                  // Log the full fee payment (this was already logged in the bust fee calculation, but we need the actual deduction)
                  console.log(`💰 [${seat.name}] Bust fee fully paid: ${feeAmount} pennies (from ${beforeBalance} to ${seat.tableStack})`);
                }
              } else {
                // Positive payout - add to table stack
                seat.tableStack += result.payout;

                // Log the payout transaction
                const hasRoles = result.roles && result.roles.length > 0;
                logMoneyFlow(
                  hasRoles ? 'PAYOUT_ROLE' : 'PAYOUT_CARGO',
                  seat.playerId,
                  seat.name,
                  'MAIN_POT',
                  'TABLE_STACK',
                  result.payout,
                  `${seat.name} received ${result.payout} pennies payout for ${hasRoles ? result.roles.join('/') : 'cargo'} (from ${beforeBalance} to ${seat.tableStack})`,
                  {
                    beforeBalance,
                    afterBalance: seat.tableStack,
                    roles: result.roles,
                    handId: currentHandHistory?.handId,
                    phase: gameState.phase
                  }
                );
              }

              // Update database for human players
              if (!seat.isAI) {
                const player = socketIdToPlayer.get(seat.playerId);
                if (player?.googleId) {
                  // Update player's in-memory bankroll to match seat
                  player.bankroll = seat.tableStack;
                  // Persist bankroll to database
                  updateUserBankroll(player.googleId, seat.tableStack / 100);
                  // Also update total winnings
                  prisma.user.update({
                    where: { googleId: player.googleId },
                    data: {
                      totalWinnings: { increment: result.payout / 100 }, // Convert from pennies to dollars
                      lastLogin: new Date()
                    }
                  }).then(() => {
                    console.log(`💾 Updated winnings for ${seat.name}: +$${result.payout / 100}`);
                  }).catch(error => {
                    console.error('Failed to update user winnings:', error);
                  });
                }
              }
            }
          }
        }
        gameState.pot = 0;
      }
      
      // Auto-advance to HandEnd
      setTimeout(() => {
        if (!gameState) return;
        gameState.phase = 'HandEnd';
        onEnterPhase();
        broadcastGameState();
      }, getGameDelay('payout_display'));
      break;
    case 'HandEnd':
      // Perform final cross-reference validation for completed hand
      if (currentHandHistory) {
        const validationReport = crossReferenceService.validateHand(currentHandHistory);
        if (!validationReport.isValid) {
          const criticalDiscrepancies = validationReport.discrepancies.filter(d => d.severity === 'critical');
          const highDiscrepancies = validationReport.discrepancies.filter(d => d.severity === 'high');

          if (criticalDiscrepancies.length > 0) {
            logger.log('error', 'game', `CRITICAL discrepancies in completed hand ${currentHandHistory.handId}`, {
              handId: currentHandHistory.handId,
              discrepancies: criticalDiscrepancies,
              validationReport
            });
          }

          if (highDiscrepancies.length > 0) {
            logger.log('warn', 'game', `High severity discrepancies in completed hand ${currentHandHistory.handId}`, {
              handId: currentHandHistory.handId,
              discrepancies: highDiscrepancies,
              summary: validationReport.summary
            });
          }

          console.log(`🔍 Hand validation: ${validationReport.summary.matchedActions}/${validationReport.summary.totalHandActions} actions matched, ${validationReport.discrepancies.length} discrepancies found`);
        } else {
          console.log(`✅ Hand validation: All ${validationReport.summary.totalHandActions} actions matched successfully`);
        }
      }

      // Save hand history before returning to lobby
      saveHandHistory();
      // Update games played counter for all seated human players
      if (gameState) {
        const humanPlayers = gameState.seats.filter(s => s.playerId && !s.isAI);
        for (const seat of humanPlayers) {
          const player = socketIdToPlayer.get(seat.playerId);
          if (player?.googleId) {
            prisma.user.update({
              where: { googleId: player.googleId },
              data: {
                totalGamesPlayed: { increment: 1 },
                lastLogin: new Date()
              }
            }).then(() => {
              console.log(`💾 Updated games played for ${seat.name}: +1`);
            }).catch(error => {
              console.error('Failed to update games played:', error);
            });
          }
        }
      }
      
      // Reset for next hand
      // SYNC: Ensure any reconnected players from table state are included in game state
      const tableSeatedPlayers = getSeatedPlayers();
      for (const tablePlayer of tableSeatedPlayers) {
        const existingGameSeat = gameState.seats.find(s => s.playerId === tablePlayer.id);
        if (!existingGameSeat) {
          // Player is seated in table but missing from game - add them back
          const emptySeatIndex = gameState.seats.findIndex(s => s === null);
          if (emptySeatIndex >= 0) {
            console.log(`🔄 SYNC: Adding reconnected player ${tablePlayer.name} back to game state for next hand`);
            gameState.seats[emptySeatIndex] = {
              playerId: tablePlayer.id,
              name: tablePlayer.name,
              isAI: tablePlayer.isAI,
              tableStack: tablePlayer.tableStack || 0,
              dice: createEmptyDiceSet(),
              hasFolded: false,
              lockAllowance: 0,
              lockingDone: false,
              currentBet: 0,
              hasActed: false,
              isAllIn: false,
              totalContribution: 0
            };
          }
        } else if (existingGameSeat.playerId !== tablePlayer.id) {
          // Update socket ID if it changed due to reconnection
          console.log(`🔄 SYNC: Updating ${tablePlayer.name} socket ID from ${existingGameSeat.playerId} to ${tablePlayer.id}`);
          existingGameSeat.playerId = tablePlayer.id;
        }
      }
      
      // Reset dice and betting state
      for (const s of gameState.seats) {
        s.dice = createEmptyDiceSet();
        s.hasFolded = false;
        s.currentBet = 0;
        s.hasActed = false;
        s.lockAllowance = 0;
        delete s.minLocksRequired;
        s.lockingDone = false;
        s.isAllIn = false;
        s.totalContribution = 0;
      }
      
      // Handle players who are standing up
      for (const s of gameState.seats) {
        if (s.standingUp && s.playerId) {
          // If this is an AI player, remove from aiPlayers array
          if (s.isAI) {
            const aiIndex = aiPlayers.findIndex(ai => ai.id === s.playerId);
            if (aiIndex !== -1) {
              aiPlayers.splice(aiIndex, 1);
            }
          } else {
            // Return seat bankroll to human player's main bankroll and update database
            const player = socketIdToPlayer.get(s.playerId);
            if (player) {
              player.bankroll += s.tableStack;
              
              // Update bankroll in database
              if (player.googleId) {
                updateUserBankroll(player.googleId, player.bankroll / 100);
              }
              
              // Remove table bankroll from database
              removeTableBankroll(player);
            }
          }
          
          // CRITICAL: Also clear the corresponding tableState seat to prevent sync issues
          const tableStateIndex = tableState.seats.findIndex(ts => ts?.id === s.playerId);
          if (tableStateIndex !== -1) {
            console.log(`🧹 Clearing tableState seat ${tableStateIndex} for standing up player ${s.name}`);
            tableState.seats[tableStateIndex] = null;
          }
          
          // Clear the game state seat
          s.playerId = '';
          s.tableStack = 0;
          s.isAI = false;
          s.name = '';
          s.cosmetics = {};
          s.standingUp = false;
        }
      }
      
      // Clear all AI players if no humans remain at the table
      const remainingHumans = tableState.seats.filter(s => s !== null && !s.isAI);
      if (remainingHumans.length === 0) {
        console.log(`🤖 No humans remain at table, clearing all AI players`);
        const aiSeats = tableState.seats.filter(s => s !== null && s.isAI);
        for (const aiSeat of aiSeats) {
          if (aiSeat) {
            // Remove from aiPlayers array
            const aiIndex = aiPlayers.findIndex(ai => ai.id === aiSeat.id);
            if (aiIndex !== -1) {
              aiPlayers.splice(aiIndex, 1);
            }
            // Clear tableState seat
            const seatIndex = tableState.seats.findIndex(s => s === aiSeat);
            if (seatIndex !== -1) {
              tableState.seats[seatIndex] = null;
            }
            // Clear gameState seat if it exists
            const gameSeat = gameState.seats.find(gs => gs.playerId === aiSeat.id);
            if (gameSeat) {
              gameSeat.playerId = '';
              gameSeat.tableStack = 0;
              gameSeat.isAI = false;
              gameSeat.name = '';
              gameSeat.cosmetics = {};
            }
          }
        }
        console.log(`🧹 Cleared ${aiSeats.length} AI players - table is now empty`);
      }
      
      gameState.currentBet = 0;
      gameState.bettingRoundComplete = false;
      gameState.bettingRoundCount = 0;
      delete gameState.showdownResults;
      delete gameState.sidePots;
      gameState.davyJonesRake = 0; // Reset hand rake, keep running total
      gameState.displayRake = 0; // Reset display rake for new hand
      
      // Auto-advance back to PreHand/Ante
      setTimeout(() => {
        if (!gameState) return;
        
        // Keep existing seated players with their current bankrolls
        // The seats already have the correct post-payout bankrolls
        // We don't add new players mid-game - they must wait for the game to end
        
        // Check if we still have enough players with money AND meet table requirements
        const activePlayers = gameState.seats.filter(s => s.tableStack > 0);
        const humanPlayers = gameState.seats.filter(s => s.tableStack > 0 && !s.isAI);
        const humanPlayerCount = humanPlayers.length;
        
        // Check against table configuration
        const minRequired = configService.getConfig().table.minHumanPlayers;
        
        if (activePlayers.length >= minRequired && humanPlayerCount >= minRequired) {
          gameState.phase = 'Ante';
          onEnterPhase();
        } else {
          // Not enough players with money OR no human players, go back to lobby
          // Preserve cargo chest when returning to lobby
          if (gameState.cargoChest !== undefined) {
            tableState.cargoChest = gameState.cargoChest;
            console.log(`💰 Preserving cargo chest when returning to lobby: ${tableState.cargoChest} pennies`);
          }
          gameState.phase = 'Lobby';
        }
        broadcastGameState();
      }, getGameDelay('hand_end'));
      break;
    default:
      break;
  }
}

function maybeStartOrResetCountdown(): void {
  // Use seated players instead of socket connections for accurate counts
  const seatedTotal = getSeatedPlayers().length;
  const seatedHumanCount = getHumanSeatedPlayers().length;
  
  console.log(`🎲 maybeStartOrResetCountdown: seatedTotal=${seatedTotal}, seatedHumans=${seatedHumanCount}`);
  
  // Only manage lobby/countdown if game is not in progress
  const gameInProgress = gameState && gameState.phase !== 'Lobby' && gameState.phase !== 'PreHand';
  if (gameInProgress) {
    // Game is in progress, don't interfere - new players must wait for next hand
    console.log(`🎲 Game in progress (${gameState?.phase}), not interfering`);
    return;
  }
  
  // Not enough seated players OR no human players → idle Lobby state
  if (seatedTotal < 4 || seatedHumanCount === 0) {
    console.log(`🎲 ❌ Creating Lobby state: seatedTotal=${seatedTotal} < 4 OR seatedHumans=${seatedHumanCount} === 0`);
    if (!gameState || gameState.phase !== 'Lobby') {
      gameState = { phase: 'Lobby', seats: [], pot: 0, currentBet: 0, ante: calculateAnteAmount(), handCount: 0 };
      broadcastGameState();
    }
    if (countdownTimer) { clearTimeout(countdownTimer); countdownTimer = null; }
    if (gameState) delete gameState.countdownEndsAtMs;
    return;
  }
  // Enough players AND at least one human → (re)start 5s countdown
  console.log(`🎲 ✅ Starting countdown: seatedTotal=${seatedTotal} >= 4 AND seatedHumans=${seatedHumanCount} > 0`);
  const players = getSeatedPlayers().slice(0, 8);
  console.log(`🎲 Creating game with ${players.length} players:`, players.map(p => `${p.name}(${p.isAI ? 'AI' : 'Human'})`));
  const ends = Date.now() + getGameDelay('countdown');
  gameState = {
    phase: 'PreHand',
    seats: players.map((p) => ({
      playerId: p.id,
      name: p.name,
      isAI: p.isAI,
      tableStack: p.tableStack || 0,
      dice: createEmptyDiceSet(),
      hasFolded: false,
      lockAllowance: 0,
      lockingDone: false,
      currentBet: 0,
      hasActed: false,
      aiProfile: p.isAI ? assignAIProfile() : undefined,
      cosmetics: p.cosmetics || {
        banner: 'classic',
        emblem: 'none',
        title: 'none',
        highSkin: 'bone-classic',
        lowSkin: 'pearl-simple'
      },
    })),
    pot: 0,
    currentBet: 0,
    ante: calculateAnteAmount('Ante'),
    countdownEndsAtMs: ends,
    handCount: (gameState?.handCount || 0) + 1,
  };
  if (countdownTimer) clearTimeout(countdownTimer);
  countdownTimer = setTimeout(() => {
    if (!gameState) return;
    delete gameState.countdownEndsAtMs;
    // Initialize hand history before starting game phases
    startNewHand();
    // If startNewHand created a new game, we're done
    // If game was already in progress, continue with Ante phase
    if (!gameState || gameState.phase === 'Lobby') return;
    gameState.phase = 'Ante';
    onEnterPhase();
    broadcastGameState();
  }, getGameDelay('countdown'));
  broadcastGameState();
}


