import { useState, useEffect } from 'react';
import { getBackendUrl } from '../utils/backendUrl';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  cargoChestValue?: number;
}

interface TableRequirements {
  rulesDisplay?: {
    sections: Record<string, {
      enabled: boolean;
      weight: number;
      type: 'static' | 'dynamic';
      span: 1 | 2 | 3;
    }>;
  };
  edgeTiersEnabled?: boolean;
  edgeTiers?: any;
  bustFeeEnabled?: boolean;
  bustFeeBasis?: string;
  cargoChestLearningMode?: boolean;
  anteEnabled?: boolean;
  anteAmount?: number;
  anteMode?: string;
}

function formatGoldCoinsCompact(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 1000).toFixed(1)}K⚜`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K⚜`;
  } else {
    return `${amount}⚜`;
  }
}

// Individual Section Components
function RoleHierarchySection() {
  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-emerald-400 mb-3">⚓ Role Hierarchy - The Pirate Chain of Command</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> Players compete for naval roles by rolling dice. Higher roles earn bigger payouts, but assignment requires both dice count AND highest total values.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Role Requirements & Payouts:</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span><strong className="text-red-400">Ship (6s):</strong> Most 6s wins</span>
                <span className="text-emerald-400">40% pot*</span>
              </div>
              <div className="flex justify-between">
                <span><strong className="text-blue-400">Captain (5s):</strong> Most 5s wins</span>
                <span className="text-emerald-400">30% pot*</span>
              </div>
              <div className="flex justify-between">
                <span><strong className="text-green-400">Crew (4s):</strong> Most 4s wins</span>
                <span className="text-emerald-400">20% pot*</span>
              </div>
              <div className="flex justify-between">
                <span><strong className="text-gray-400">Non-roles:</strong> Cargo share</span>
                <span className="text-emerald-400">10% pot*</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                <em>*Percentages configurable per table<br/>Need minimum 2 of each die value to qualify</em>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Assignment Rules:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• Multiple roles possible for one player</li>
              <li>• Roles can go unfilled if minimums not met</li>
              <li>• Ties broken by dice total, then by time</li>
              <li>• Ship &gt; Captain &gt; Crew in importance</li>
              <li>• Non-role dice (1s, 2s, 3s) become cargo</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Assignment:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Alice: [6,6,6,5,4] (Total: 26)</strong> vs <strong>Bob: [6,6,4,4,1] (Total: 19)</strong></p>
            <p>• <strong>Ship:</strong> Alice has 3 sixes, Bob has 2 sixes → <span className="text-red-400">Alice wins Ship</span></p>
            <p>• <strong>Captain:</strong> Alice has 1 five, Bob has 0 fives → <span className="text-blue-400">Alice wins Captain</span> (needs min 2, so unfilled)</p>
            <p>• <strong>Crew:</strong> Alice has 1 four, Bob has 2 fours → <span className="text-green-400">Bob wins Crew</span></p>
            <p>• <strong>Final:</strong> Alice gets Ship only, Bob gets Crew only, Captain unfilled</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Insights:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• <strong>Risk vs Reward:</strong> Going for Ship (6s) is high-value but competitive</li>
            <li>• <strong>Minimum Strategy:</strong> Sometimes aim for guaranteed Crew rather than contested Ship</li>
            <li>• <strong>Multi-Role Power:</strong> Skilled players can secure multiple roles for massive payouts</li>
            <li>• <strong>Cargo Backup:</strong> Even without roles, 1s/2s/3s can win significant cargo prizes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function CargoChestSection({ cargoChestValue, tableConfig }: { cargoChestValue: number; tableConfig: TableRequirements | null }) {
  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-amber-400 mb-3">🏴‍☠️ Cargo Chest - Progressive Jackpot System</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> A growing treasure chest funded by game activity. Players with matching low dice AND sufficient activity stamps can claim percentage payouts.
        </div>

        <div className="flex items-center justify-between bg-gradient-to-r from-yellow-900/40 to-yellow-700/40 p-3 rounded border border-yellow-600/50">
          <span className="text-yellow-200 font-medium">Current Chest Value:</span>
          <span className="text-yellow-400 font-bold text-lg">{formatGoldCoinsCompact(cargoChestValue)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Growth Mechanics:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• <strong>10% Drip:</strong> All wagers contribute to growth</li>
              <li>• <strong>Bust Fees:</strong> Players with no roles pay penalties</li>
              <li>• <strong>Vacant Roles:</strong> 50% → chest, 50% → active winners (proportional to role %)</li>
              <li>• <strong>Persistent:</strong> Carries between hands</li>
              <li>• <strong>Table-Specific:</strong> Each table has own chest</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Payout System:</h4>
            <div className="space-y-1">
              <div><strong className="text-green-400">Pair (1s/2s/3s):</strong> 10% of chest</div>
              <div><strong className="text-blue-400">Three of a Kind:</strong> 15% of chest</div>
              <div><strong className="text-purple-400">Four of a Kind:</strong> 25% of chest</div>
              <div><strong className="text-red-400">Five of a Kind:</strong> 50% of chest</div>
              <div className="text-xs text-gray-400 mt-2">
                <em>Must have 3+ stamps from recent 5 hands</em>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Chest Payout:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Chest Value: 500⚜ | Your Hand: [3,3,2,2,1]</strong></p>
            <p>• You have <strong className="text-cyan-400">two pair</strong> with cargo dice (3s and 2s)</p>
            <p>• You've been active <strong className="text-green-400">3 of last 5 hands</strong> (3 stamps) ✅</p>
            <p>• <strong className="text-blue-400">Pair bonus:</strong> 10% + <strong className="text-purple-400">Another pair bonus:</strong> 10% = 20% total</p>
            <p>• You win 20% of 500⚜ = <span className="text-yellow-400 font-bold">100⚜ chest bonus!</span></p>
            <p>• Chest drops to 400⚜ and continues growing</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Impact:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• Incentivizes active play (need stamps to qualify)</li>
            <li>• Makes low dice valuable beyond just cargo</li>
            <li>• Creates exciting "jackpot moments"</li>
            <li>• Rewards consistent table presence</li>
            <li>• Adds value to otherwise weak hands</li>
          </ul>
        </div>

        {/* Stamp System Explanation */}
        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-cyan-400 mb-2">📋 Stamp System - Activity Tracking</h4>
          <div className="text-xs space-y-2 text-gray-300">
            <div>
              <p><strong className="text-cyan-300">How Stamps Work:</strong></p>
              <ul className="space-y-1 ml-2 mt-1">
                <li>• <strong>Earn stamps</strong> by contributing any money to the pot (ante, bets, calls, raises)</li>
                <li>• <strong>Tracked over 5 hands</strong> - rolling window of recent activity</li>
                <li>• <strong>Need 3+ stamps</strong> to qualify for chest payouts</li>
                <li>• <strong>Stamps reset</strong> each time you leave the table</li>
              </ul>
            </div>

            <div className="bg-slate-700/50 p-2 rounded">
              <p><strong className="text-emerald-400">Example Stamp Tracking:</strong></p>
              <div className="text-xs mt-1 space-y-1">
                <p>Hand 1: Ante + bet, then fold → <span className="text-green-400">✓ Stamp</span> (1/5)</p>
                <p>Hand 2: Skip ante, don't play → <span className="text-red-400">✗ No stamp</span> (1/5)</p>
                <p>Hand 3: Ante only, fold immediately → <span className="text-green-400">✓ Stamp</span> (2/5)</p>
                <p>Hand 4: Ante + betting action → <span className="text-green-400">✓ Stamp</span> (3/5) <span className="text-yellow-400">← Eligible!</span></p>
                <p>Hand 5: Win cargo with [2,2,2,1,1] → <span className="text-emerald-400 font-bold">Chest payout!</span></p>
              </div>
            </div>

            <div>
              <p><strong className="text-orange-400">Strategic Considerations:</strong></p>
              <ul className="space-y-1 ml-2 mt-1">
                <li>• <strong>Stay active:</strong> Even just posting ante gets you a stamp</li>
                <li>• <strong>Plan ahead:</strong> Need 3 hands of any financial participation before qualifying</li>
                <li>• <strong>Table commitment:</strong> Leaving resets your stamp progress</li>
                <li>• <strong>Worth the investment:</strong> Chest payouts can be substantial</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Learning Mode Status */}
        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-cyan-400">🎓 Learning Mode:</span>
            <span className={`font-bold text-sm ${tableConfig?.cargoChestLearningMode ? 'text-red-400' : 'text-green-400'}`}>
              {tableConfig?.cargoChestLearningMode ? '🔒 STRICT' : '✅ BEGINNER FRIENDLY'}
            </span>
          </div>
          <div className="text-xs text-gray-300 mt-2">
            {tableConfig?.cargoChestLearningMode ? (
              <div className="space-y-1">
                <p><strong className="text-red-300">Strict Mode:</strong> Must have 3+ stamps to qualify for chest payouts</p>
                <p>• No grace period for new tables</p>
                <p>• Encourages regular play to build stamp history</p>
                <p>• Prevents "drive-by" chest claims</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p><strong className="text-green-300">Beginner Friendly:</strong> Fresh tables allow chest claims without stamps</p>
                <p>• Grace period when ≤2 people have stamps</p>
                <p>• Helps new players experience chest payouts</p>
                <p>• Transitions to strict mode as table matures</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockingRulesSection() {
  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-blue-400 mb-3">🔒 Locking Rules - Strategic Dice Selection</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> Each round you lock dice to build your hand. Locked dice skip the next roll but can be unlocked later. Only a minimum number are revealed publicly before each betting round.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Lock & Reveal Requirements:</h4>
            <div className="space-y-1">
              <div><strong className="text-green-400">Round 1:</strong> Lock ≥1 die → Reveal exactly 1</div>
              <div><strong className="text-yellow-400">Round 2:</strong> Lock ≥2 dice total → Reveal exactly 2</div>
              <div><strong className="text-red-400">Round 3:</strong> Lock ≥3 dice total → Reveal exactly 3</div>
              <div className="text-xs text-gray-400 mt-2">
                <em>You can lock more than minimum - extras stay hidden until showdown</em>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Lock Mechanics:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• Locked dice skip the next roll only</li>
              <li>• You can unlock dice and roll them again</li>
              <li>• You can change which dice are locked</li>
              <li>• Only minimum revealed before betting</li>
              <li>• Extra locks = hidden information advantage</li>
              <li>• Round 4 reveals all dice at once</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Hand Progression:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Initial Roll: [6,5,4,2,1]</strong></p>
            <p>• <strong>Lock1:</strong> Lock [6,5,4] (3 dice), reveal only [6] → Opponents see: 🔒[6] vs ❓❓❓❓</p>
            <p>• <strong>Roll2:</strong> Re-roll [2,1] → Get [5,3]. Unlock the 4, keep 6 locked</p>
            <p>• <strong>Lock2:</strong> Lock [6,5,5] (3 total), reveal [6,5] → Opponents see: 🔒[6,5] vs ❓❓❓</p>
            <p>• <strong>Roll3:</strong> Re-roll [4,3] → Get [6,5]</p>
            <p>• <strong>Lock3:</strong> Lock [6,6,5,5,5], reveal [6,6,5] → Opponents see: 🔒[6,6,5] vs ❓❓</p>
            <p>• <strong>Round 4:</strong> All revealed → Final hand: [6,6,5,5,5] (Ship + Captain!)</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Considerations:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• <strong>Information vs Security:</strong> Lock strong dice early to secure them, but reveal strength</li>
            <li>• <strong>Minimum vs Maximum:</strong> Lock only minimum to hide hand, or lock extras for certainty</li>
            <li>• <strong>Role Priority:</strong> Always secure Ship (6) and Captain (5) if possible</li>
            <li>• <strong>Bluffing Potential:</strong> Lock weak dice to mislead opponents about hand strength</li>
            <li>• <strong>Cargo Calculations:</strong> Consider which dice will be cargo when locking non-roles</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function AnteSection({ tableConfig }: { tableConfig: TableRequirements | null }) {
  if (!tableConfig?.anteEnabled) return null;

  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-amber-400 mb-3">🎲 Ante System - Entry Fee & Strategic Choice</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> Before the first betting round, all players must decide whether to post the ante (entry fee) or fold. This creates an initial pot and gives players strategic choice to participate.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Ante Mechanics:</h4>
            <div className="space-y-1">
              <div><strong className="text-green-400">Amount:</strong> {formatGoldCoinsCompact(tableConfig?.anteAmount || 0)}</div>
              <div><strong className="text-blue-400">When:</strong> Before Street 1 betting</div>
              <div><strong className="text-yellow-400">Choice:</strong> Post Ante or Fold</div>
              <div><strong className="text-purple-400">Pot Growth:</strong> 5% drips to Cargo Chest</div>
              <div className="text-xs text-gray-400 mt-2">
                <em>Mode: {tableConfig?.anteMode || 'per_player'}</em>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Strategic Decision:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• Turn-based ante collection</li>
              <li>• Players choose: Post or Fold</li>
              <li>• Folding = no ante cost, no hand participation</li>
              <li>• Posting = commits to street 1 betting</li>
              <li>• All antes collected before first bet</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Ante Round:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Ante Amount: 50⚜ per player</strong></p>
            <p>• Alice: <span className="text-green-400">Posts 50⚜</span> → Pot now 50⚜ (47.5⚜ main + 2.5⚜ chest drip)</p>
            <p>• Bob: <span className="text-green-400">Posts 50⚜</span> → Pot now 95⚜</p>
            <p>• Charlie: <span className="text-red-400">Folds</span> → Sits out this hand, no cost</p>
            <p>• Diana: <span className="text-green-400">Posts 50⚜</span> → Pot now 142.5⚜</p>
            <p>• <strong>Result:</strong> 3 players move to Street 1 betting, 1 folded safely</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Impact:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• <strong>Player Agency:</strong> Choice to play each hand, not forced to ante</li>
            <li>• <strong>Bankroll Management:</strong> Fold when low on chips to preserve stack</li>
            <li>• <strong>Table Dynamics:</strong> Fewer antes = smaller pot but better odds</li>
            <li>• <strong>Pot Building:</strong> Antes create initial value worth fighting for</li>
            <li>• <strong>Risk Assessment:</strong> Decide early if hand is worth ante investment</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function BettingSection() {
  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-red-400 mb-3">💰 Betting - Multi-Street Poker Action</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> Three separate betting rounds create escalating tension. Early streets have lower limits while later streets allow bigger bets as hands develop and information increases.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Betting Actions:</h4>
            <div className="space-y-1">
              <div><strong className="text-green-400">Check:</strong> Pass action (no cost)</div>
              <div><strong className="text-blue-400">Bet:</strong> First wager on street</div>
              <div><strong className="text-yellow-400">Call:</strong> Match current bet</div>
              <div><strong className="text-purple-400">Raise:</strong> Increase the bet</div>
              <div><strong className="text-red-400">Fold:</strong> Forfeit hand & all bets</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Street Structure:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• <strong>Street 1:</strong> After Lock 1 (1 die locked)</li>
              <li>• <strong>Street 2:</strong> After Lock 2 (2+ dice locked)</li>
              <li>• <strong>Street 3:</strong> After Lock 3 (3+ dice locked)</li>
              <li>• Each street has escalating bet limits</li>
              <li>• Action continues until all call or fold</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Betting Sequence:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Street 2 (Limit: $3.00)</strong></p>
            <p>• Alice (showing 🔒[6,5]): <span className="text-green-400">Checks</span></p>
            <p>• Bob (showing 🔒[6,4]): <span className="text-blue-400">Bets $2.00</span></p>
            <p>• Charlie (showing 🔒[5,3]): <span className="text-red-400">Folds</span> (loses ante + Street 1 bets)</p>
            <p>• Alice: <span className="text-purple-400">Raises to $3.00</span> (max for her tier)</p>
            <p>• Bob: <span className="text-yellow-400">Calls $1.00</span> → Street ends, both continue</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Elements:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• <strong>Position Matters:</strong> Later action sees opponents' choices first</li>
            <li>• <strong>Information Warfare:</strong> Locked dice reveal hand strength progressively</li>
            <li>• <strong>Pot Commitment:</strong> Edge Tiers make folding expensive for big contributors</li>
            <li>• <strong>Bluff Opportunities:</strong> Bet strong with weak locks to represent strength</li>
            <li>• <strong>Value Extraction:</strong> Build pots when holding strong roles</li>
            <li>• <strong>Folding Equity:</strong> Sometimes better to fold early than chase bad hands</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function BustFeeSection({ tableConfig }: { tableConfig: TableRequirements | null }) {
  if (!tableConfig?.bustFeeEnabled) return null;

  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-orange-400 mb-3">💸 Bust Fee - Penalty for Weak Hands</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> Players who end a hand with no roles (Ship, Captain, or Crew) pay a penalty fee. This discourages folding and rewards staying in the game to fight for roles.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Fee Structure:</h4>
            <div className="space-y-1">
              <div><strong className="text-red-400">Trigger:</strong> No roles at showdown</div>
              <div><strong className="text-yellow-400">Amount:</strong> Based on {tableConfig?.bustFeeBasis || 'Street 2'} limit</div>
              <div><strong className="text-green-400">Destination:</strong> Added to Cargo Chest</div>
              <div className="text-xs text-gray-400 mt-2">
                <em>Only applies to players who stay until showdown</em>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Fee Mechanics:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• Calculated after role assignments</li>
              <li>• Deducted from any winnings first</li>
              <li>• Can create negative payouts</li>
              <li>• Folded players avoid bust fees</li>
              <li>• Encourages aggressive role pursuit</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Scenarios:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Scenario 1: Pure Bust</strong></p>
            <p>• Alice ends with hand [4,3,2,2,1] → No roles</p>
            <p>• Alice pays <span className="text-red-400">$3.00 bust fee</span> → Added to Cargo Chest</p>
            <p>• Final payout: <span className="text-red-400">-$3.00</span> (net loss)</p>

            <p className="mt-2"><strong>Scenario 2: Cargo Winner with Bust Fee</strong></p>
            <p>• Bob has no roles but wins cargo with [4,3,3,3,1]</p>
            <p>• Cargo payout: <span className="text-green-400">+$8.00</span>, Bust fee: <span className="text-red-400">-$3.00</span></p>
            <p>• Final payout: <span className="text-yellow-400">+$5.00</span> (net positive)</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Impact:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• <strong>Anti-Folding Mechanism:</strong> Makes folding more attractive than staying with weak hands</li>
            <li>• <strong>Role Competition:</strong> Increases pressure to secure at least one role</li>
            <li>• <strong>Cargo Chest Growth:</strong> Bust fees fuel the progressive jackpot</li>
            <li>• <strong>Risk vs Reward:</strong> Players must weigh staying costs against potential winnings</li>
            <li>• <strong>Hand Reading:</strong> Knowing bust fee risk affects calling decisions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function EdgeTiersSection({ tableConfig }: { tableConfig: TableRequirements | null }) {
  if (!tableConfig?.edgeTiersEnabled) return null;

  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-purple-400 mb-3">⚔️ Edge Tiers - Dynamic Betting System</h3>
      <div className="space-y-3 text-sm text-gray-200">
        <div className="text-sm text-blue-200 bg-blue-900/30 p-2 rounded border border-blue-600/30">
          <strong>Core Concept:</strong> Your betting power scales with your risk. The more you've already invested in the pot, the more you're allowed to bet to protect your investment.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">Tier Classifications:</h4>
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span><strong className="text-red-400">Behind (0.5x):</strong></span>
                <span className="text-xs text-gray-400">Lowest contributor</span>
              </div>
              <div className="flex justify-between items-start">
                <span><strong className="text-yellow-400">Co-Pilot (0.75x):</strong></span>
                <span className="text-xs text-gray-400">Mid-range contributor</span>
              </div>
              <div className="flex justify-between items-start">
                <span><strong className="text-blue-400">Leader (1.0x):</strong></span>
                <span className="text-xs text-gray-400">Highest contributor</span>
              </div>
              <div className="flex justify-between items-start">
                <span><strong className="text-purple-400">Dominant (1.25x):</strong></span>
                <span className="text-xs text-gray-400">2x+ vs others</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-yellow-300">How It Works:</h4>
            <ul className="text-xs space-y-1 text-gray-300">
              <li>• Tiers update after each betting action</li>
              <li>• Based on total pot contributions</li>
              <li>• Includes antes, bets, and raises</li>
              <li>• Resets each new hand</li>
              <li>• Multipliers apply to street limits</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-800/50 p-3 rounded border border-slate-600/50">
          <h4 className="font-semibold text-emerald-400 mb-2">Example Scenario:</h4>
          <div className="text-xs space-y-1 text-gray-300">
            <p><strong>Street 2 (Base limit: $3.00)</strong></p>
            <p>• Alice has contributed $15 total → <span className="text-blue-400">Leader (1.0x)</span> → Can bet up to $3.00</p>
            <p>• Bob has contributed $8 total → <span className="text-yellow-400">Co-Pilot (0.75x)</span> → Can bet up to $2.25</p>
            <p>• Charlie has contributed $4 total → <span className="text-red-400">Behind (0.5x)</span> → Can bet up to $1.50</p>
            <p>• If Alice's contribution reaches $32+ (2x Bob's), she becomes <span className="text-purple-400">Dominant (1.25x)</span> → Can bet up to $3.75</p>
          </div>
        </div>

        <div className="text-xs text-gray-400 space-y-1">
          <p><strong className="text-orange-400">Strategic Impact:</strong></p>
          <ul className="space-y-1 ml-2">
            <li>• Protects pot-committed players from being bullied out</li>
            <li>• Prevents chip leaders from overwhelming smaller stacks cheaply</li>
            <li>• Creates catch-up mechanics for players who fell behind early</li>
            <li>• Rewards aggressive early play with dominant position control</li>
          </ul>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span>System Status:</span>
          <span className="text-green-400 font-bold text-sm">✅ ENABLED</span>
        </div>
      </div>
    </div>
  );
}

// Helper function to convert span to CSS classes
function getSpanClass(span: 1 | 2 | 3): string {
  switch (span) {
    case 1:
      return 'col-span-1';
    case 2:
      return 'col-span-1 md:col-span-2';
    case 3:
      return 'col-span-1 md:col-span-2 lg:col-span-3';
    default:
      return 'col-span-1';
  }
}

export default function RulesModal({ isOpen, onClose, cargoChestValue = 0 }: RulesModalProps) {
  const [tableConfig, setTableConfig] = useState<TableRequirements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTableConfig = async () => {
      try {
        const BACKEND_URL = getBackendUrl();
        const response = await fetch(`${BACKEND_URL}/api/table-requirements`);
        if (response.ok) {
          const config = await response.json();
          setTableConfig(config);
        }
      } catch (error) {
        console.error('Failed to fetch table config:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchTableConfig();
    }
  }, [isOpen]);

  // Function to render sections dynamically based on configuration
  const renderRuleSections = () => {
    if (!tableConfig?.rulesDisplay?.sections) {
      // Fallback to default order if config not available
      return (
        <>
          <RoleHierarchySection />
          <CargoChestSection cargoChestValue={cargoChestValue} tableConfig={tableConfig} />
          <LockingRulesSection />
          <AnteSection tableConfig={tableConfig} />
          <BettingSection />
          <BustFeeSection tableConfig={tableConfig} />
          <EdgeTiersSection tableConfig={tableConfig} />
        </>
      );
    }

    // Sort sections by weight, then render enabled ones
    const sortedSections = Object.entries(tableConfig.rulesDisplay.sections)
      .filter(([_, config]) => config.enabled)
      .sort(([, a], [, b]) => a.weight - b.weight);

    return sortedSections.map(([sectionKey, config]) => {
      const spanClass = getSpanClass(config.span);

      switch (sectionKey) {
        case 'role_hierarchy':
          return (
            <div key={sectionKey} className={spanClass}>
              <RoleHierarchySection />
            </div>
          );
        case 'cargo_chest':
          return (
            <div key={sectionKey} className={spanClass}>
              <CargoChestSection cargoChestValue={cargoChestValue} tableConfig={tableConfig} />
            </div>
          );
        case 'locking_rules':
          return (
            <div key={sectionKey} className={spanClass}>
              <LockingRulesSection />
            </div>
          );
        case 'ante':
          return (
            <div key={sectionKey} className={spanClass}>
              <AnteSection tableConfig={tableConfig} />
            </div>
          );
        case 'betting':
          return (
            <div key={sectionKey} className={spanClass}>
              <BettingSection />
            </div>
          );
        case 'bust_fee':
          return (
            <div key={sectionKey} className={spanClass}>
              <BustFeeSection tableConfig={tableConfig} />
            </div>
          );
        case 'edge_tiers':
          return (
            <div key={sectionKey} className={spanClass}>
              <EdgeTiersSection tableConfig={tableConfig} />
            </div>
          );
        default:
          return null;
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-75" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header with X button */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">🏴‍☠️ Pirate Plunder Rules</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none p-1"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="text-center text-gray-400">Loading rules configuration...</div>
          ) : (
            <>
              {/* Objective and Quick Start */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-slate-700 rounded-lg p-4">
                  <h3 className="text-xl font-bold text-yellow-400 mb-3">🎯 Objective</h3>
                  <p className="text-gray-200">Win the most gold by securing roles (Ship, Captain, Crew) or cargo through strategic dice rolling and poker-style betting.</p>
                </div>

                <div className="bg-slate-700 rounded-lg p-4">
                  <h3 className="text-xl font-bold text-blue-400 mb-3">🎮 Quick Start</h3>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-200">
                    <li>Join lobby (4+ players recommended)</li>
                    <li>Ante up to join the hand</li>
                    <li>Roll dice, lock strategic ones</li>
                    <li>Bet based on your hand strength</li>
                    <li>Repeat for 3 rounds</li>
                    <li>Final showdown determines winners</li>
                  </ol>
                </div>

                <div className="bg-slate-700 rounded-lg p-4">
                  <h3 className="text-xl font-bold text-amber-400 mb-3">⚜️ Currency</h3>
                  <div className="space-y-2 text-sm text-gray-200">
                    <div className="bg-amber-900/30 p-2 rounded border border-amber-600/30">
                      <p className="text-amber-200 font-semibold text-center">$1 USD = 100⚜ Gold</p>
                    </div>
                    <ul className="space-y-1 text-xs text-gray-300">
                      <li>• All bets and winnings shown in gold</li>
                      <li>• Bankroll converts automatically</li>
                      <li>• Example: $5.00 bet = 500⚜</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Dynamic Rules Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {renderRuleSections()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
