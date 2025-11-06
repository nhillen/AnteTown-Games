## Role & Cargo Dice Poker – GDD v0.3

### 1. Game Overview
A multiplayer digital dice game inspired by Ship, Captain, Crew with poker-style betting rounds. Players compete to fill one of three roles (Ship, Captain, Crew) over three rolls, then split the pot based on role payout rules and a Cargo Twist mechanic.

**Target**
- 4–8 players
- Works with live players and “ghost” AI fill-ins
- Stakes handled offline, with buy-in, blinds, and betting limits creating poker-like tension

### 2. Core Loop
- Lobby – Wait for players; fill empty seats with AI
- Buy-in – Each player starts with $5–$10 real equivalent (offline)
- Blinds – Small Blind and Big Blind rotate like in Hold’em
- Antes – Optional $0.01–$0.05 ante to build pots faster
- Game Flow with Three Betting Rounds (like Hold'em streets):
  - Roll 1 → Lock 1 (lock 1 die face-up) → Bet 1
  - Roll 2 → Lock 2 (lock 1 die face-up) → Bet 2
  - Roll 3 → Lock 3 (lock more dice, some private) → Roll 4 (final reveal) → Bet 3
- Showdown – Assign roles, apply Cargo Twist, distribute pot
- Settle-up Screen – Shows final credit balances; real money handled via Cash App links/QRs

### 3. Roles
- **Ship**: Most 6s locked
- **Captain**: Most 5s locked
- **Crew**: Most 4s locked
- **Non-role players**: Still in but no role

### 4. Cargo Twist
Cargo = All remaining 1s, 2s, 3s from players still in at showdown. Find the plurality face in cargo:

| Cargo Result | Effect |
| --- | --- |
| 1s | All non-role players still in split 50% of Crew share |
| 2s | Captain takes Crew’s share |
| 3s | Crew takes 50% of Captain’s share |

### 5. Payout Rules
Pot is split into shares:

- Ship: 40%
- Captain: 30%
- Crew: 20%
- Non-roles: 10% (if no cargo effect)

**Exclusive Role Bonus**
- If one role is unfilled, its share goes to:
  - Remaining roles equally if >1 role filled
  - Entirely to the last role standing if only one role filled

### 6. Betting Structure
- Blinds: Small Blind = 1 unit, Big Blind = 2 units
- Limit Type: No-limit or Pot-limit (decide pre-game)
- Betting Rounds: 3 max raises per street (for limit play)
- Min Raise: Equal to last bet size

### 7. Buy-in & Bankroll
- Recommended buy-in: $5–$10 (offline real money)
- Min bankroll to sit: 20 big blinds
- Players may rebuy if busted (table option)

### 8. Settle-up Screen
End of session or when table breaks:

- Show each player’s final net credits (start vs. finish)
- If positive, show “Receive $X from” with Cash App link/QR to opponent
- If negative, show “Send $X to” with Cash App link/QR to opponent
- Settlement done outside the game; game only tracks virtual credits

### 9. AI Guidelines
- Bluffing: Random % chance weighted by locked dice strength & cargo potential
- Role Exclusivity Awareness: Bet aggressively if likely last role filled
- Cargo Influence: Stay in if cargo could swing pot share in AI’s favor
- Pot Odds Calculation: Compare call size to potential share EV

### 10. Tech Stack (Prototype)
**Frontend**
- React + TailwindCSS
- Socket.io for live state sync

**Backend**
- Node.js + Express
- Socket.io server
- Simple in-memory game state (Redis optional for persistence)

**Auth**
- Supabase Auth or Auth0 (email link login)

**Hosting**
- Render or Railway for backend
- Netlify or Vercel for frontend

**AI Players**
- Simple weighted-random decision tree in backend

**Min Player Fill**
- Always fill to 4 with AI if fewer humans

### 11. Desired Outcomes
- Psychological stakes: Players feel real tension from blinds, raises, and endgame split rules
- Replayability: Cargo twists & exclusive role bonuses create varied outcomes
- Simple onboarding: Rules explained in <2 minutes
- Safe money handling: All financial transactions outside the app