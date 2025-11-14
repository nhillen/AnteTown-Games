# Game Improvements TODO

This document tracks planned improvements and known issues across all games in the PiratePlunder platform.

**Last Updated**: 2025-10-20

---

## 🎯 Cross-Game Issues

### ✅ Coin Flip Game Package Migration
**Priority**: Medium
**Status**: ✅ Completed - 2025-11-01

**Issue**: Coin flip game needs to be refactored into its own package like WarFaire
- ~~Currently embedded directly in PiratePlunder codebase~~ ✅ Now in `@pirate/game-coin-flip` package
- ~~Should follow same package pattern as `@pirate/game-warfaire`~~ ✅ Follows WarFaire pattern
- ~~Needs to implement GameBase pattern from `@pirate/game-sdk`~~ ✅ Extends GameBase
- ~~Should be consumable by both backend and frontend~~ ✅ Exports both backend and frontend

**Files Created**:
- ✅ Package: `@pirate/game-coin-flip`
- ✅ Game logic classes: `CoinFlipGame.ts`, `CardFlipGame.ts` (extend GameBase)
- ✅ Client component: `FlipzClient.tsx` with variant switching
- ✅ Table components: `CoinFlipTable.tsx`, `CardFlipTable.tsx`
- ✅ Lobby integration: `FlipzTableCard.tsx` + generic `MultiTableLobby` in SDK
- ✅ Package.json with proper exports

**Benefits Achieved**:
- ✅ Consistent game loading architecture
- ✅ Easier to maintain and test
- ✅ Can be versioned independently
- ✅ Removed 1,760 lines of duplicate code

---

### Coin Flip Game - Cannot Start Game / Add AI
**Priority**: High
**Status**: ✅ Fixed - 2025-11-01

**Issue**: "Add AI" button required admin privileges, preventing non-admin players from adding opponents

**Root Cause**: Button condition checked `isAdmin` instead of `isSeated`, creating chicken-and-egg problem:
- Cannot start game without 2 players
- Cannot add AI without admin privileges
- Result: Non-admin users stuck in lobby alone

**Fix Applied** (Commit 8296b55):
- Changed button condition from `isAdmin &&` to `isSeated &&` in both CoinFlipTable and CardFlipTable
- Now any seated player can add AI opponents (appropriate for casual game mode)
- Backend handlers already worked correctly
- "Start Hand" button already required 2 players (working as designed)

**Files Changed**:
- `packages/game-coin-flip/src/components/CoinFlipTable.tsx:211`
- `packages/game-coin-flip/src/components/CardFlipTable.tsx:274`

---

### Coin Flip Game - Seat Movement Issue
**Priority**: Medium
**Status**: Not Started

**Issue**: Clicking another seat while already seated adds player to new seat instead of moving
- Expected: Player moves from seat A to seat B
- Actual: Player occupies both seat A and seat B

**Investigation Needed**:
- Check seat selection logic in GameApp.tsx
- Verify unseat/reseat logic for coin flip game type
- May be related to GameBase seat management

---

### PiratePlunder - Cannot Start Game / Add AI
**Priority**: High
**Status**: ⚠️ Investigated - Not Actually Broken

**Initial Report**: Game start and AI addition believed to be broken

**Investigation Findings** (2025-11-01):
- ✅ Backend handlers work correctly (`start_hand` at server.ts:4103, `add_ai` at server.ts:3923)
- ✅ "Start New Hand" button visible to all players in lobby (GameApp.tsx:874)
- ✅ Socket events properly wired for Pirate Plunder
- ⚠️ "Add AI" functionality restricted to admin users only (by design per GameApp.tsx:834)

**Actual Behavior** (Working As Designed):
1. "Start Hand" requires `canStartGame()` check (minHumanPlayers from config)
2. "Add AI" requires admin privileges (must log in as `nhillen@gmail.com` or have `isAdmin=true` in database)
3. Admin panel is only visible to authenticated admin users

**If Non-Admin Access Needed**:
- Grant `isAdmin=true` to additional users in PostgreSQL database
- Or implement separate "practice mode" with relaxed restrictions

---

## 🎪 WarFaire Design System Implementation

### Overview
Complete visual redesign of WarFaire client to implement cohesive design system while maintaining all existing game logic.

**Priority**: Medium
**Status**: Not Started

**Important Constraints**:
- ✅ Edit presentational code only
- ❌ Do NOT change logic, props, IDs, event handlers, API calls
- ❌ Do NOT modify game state management or effects
- ✅ May only add className props or wrap in containers

---

### Phase 1: Foundation Setup

#### 1.1 Create Assets Folder
**Files to Create**:
- `/home/nathan/GitHub/WarFaire/assets/` directory
- `/home/nathan/GitHub/WarFaire/assets/icons/` subdirectory
- `/home/nathan/GitHub/WarFaire/assets/images/` subdirectory

**Purpose**: Centralized location for all game images and icons

---

#### 1.2 Design Tokens
**File to Create**: `/home/nathan/GitHub/WarFaire/src/design-tokens.ts`

```typescript
export const tokens = {
  typography: {
    title: { size: 20, lineHeight: 24 },
    body: { size: 14, lineHeight: 20 },
    caption: { size: 12, lineHeight: 16 }
  },
  spacing: {
    xs: 8,
    sm: 16,
    md: 24
  },
  radius: 8,
  stroke: 1,
  icons: {
    size: 24,
    stroke: 2,
    smallSize: 16
  }
}
```

---

#### 1.3 Icon System
**File to Create**: `/home/nato/GitHub/WarFaire/src/components/Icon.tsx`

**Component API**:
```typescript
interface IconProps {
  name: string;  // Maps to category IDs
  size?: 16 | 24;
  className?: string;
}
```

**Icon Map to Create**:
- Map each category name to icon identifier
- 24px line icons with 2px stroke, rounded caps
- 16px variants for chips

**Action**: Replace ALL emoji in UI with Icon component

---

### Phase 2: Card Components

#### 2.1 CardShell Component
**File to Create**: `/home/nathan/GitHub/WarFaire/src/components/CardShell.tsx`

**Specifications**:
- Aspect ratio: 5:7
- Border radius: 8px
- Keyline: 1px

**Layout Regions**:
- Top-left: Category icon (20px)
- Top-right: ValueBadge (pill shape)
- Center: ArtFrame area
- Bottom: NameBar

**Important**: Remove any text/numbers overlaying the art

---

#### 2.2 ValueBadge Component
**File to Create**: `/home/nathan/GitHub/WarFaire/src/components/ValueBadge.tsx`

**Specifications**:
- Pill shape in top-right of card
- Number only (no labels)
- Position: top-right corner of CardShell

---

#### 2.3 CardBack Component
**File to Create**: `/home/nathan/GitHub/WarFaire/src/components/CardBack.tsx`

**Specifications**:
- Pattern design (decorative)
- Small "next fair" chip indicator
- Used when Face-Up toggle is off
- Appears in Slot A/B previews

---

### Phase 3: Hand Section

#### 3.1 Hand Tab Rendering
**File to Modify**: `/home/nathan/GitHub/WarFaire/src/WarFaireClient.tsx`

**Changes**:
- Render exactly 3 CardShells from existing hand data
- Clicking card: DO NOT move the DOM node
- Add 'selected' visual state (1px accent keyline + subtle shadow)
- Invoke existing selection handler to fill Slot A/B
- Selected visual: preserve existing handler logic

**Visual States**:
- Default: Standard CardShell
- Selected: 1px accent keyline + subtle shadow

---

### Phase 4: Categories Section

#### 4.1 Category Grid Layout
**File to Modify**: `/home/nathan/GitHub/WarFaire/src/WarFaireClient.tsx`

**Changes**:
- 2-column grid layout
- Each tile: 56px tall
- Remove extra glyphs and emoji (use Icon component)

**Tile Content** (left to right):
- Icon component (24px)
- Category name (body14)
- Group name (caption12)
- LeaderChip (right-aligned)
- Delta to second place (caption12, format: "+Δ")

---

#### 4.2 LeaderChip Component
**File to Create**: `/home/nathan/GitHub/WarFaire/src/components/LeaderChip.tsx`

**Specifications**:
```typescript
interface LeaderChipProps {
  avatarUrl: string;
  points: number;
  delta: number;  // Difference to second place
}
```

**Layout**:
- 24px avatar
- Numeric badge showing total points
- Small delta indicator (+X to second)

---

#### 4.3 Category Hover Popover
**File to Modify**: Category tile hover behavior

**Changes**:
- Popover width: 280px
- Table layout with columns: Player, Total, Round Δ
- Round Δ formatted as superscript (e.g., "+3")
- Sorted descending by total
- **NO NEW DATA FETCH** - use existing totals and round deltas
- Close on Esc/outside click

---

### Phase 5: Board Section

#### 5.1 Board Row Layout
**File to Modify**: `/home/nathan/GitHub/WarFaire/src/WarFaireClient.tsx`

**Changes**:
- Row height: 40px
- Columns: avatar, name, inline Face-Up chips
- Use MiniCardChip for each face-up card
- Do NOT render empty placeholders

---

#### 5.2 MiniCardChip Component
**File to Create**: `/home/nathan/GitHub/WarFaire/src/components/MiniCardChip.tsx`

**Specifications**:
```typescript
interface MiniCardChipProps {
  iconName: string;
  value: number;
}
```

**Purpose**: Compact card representation for board rows (icon + value)

---

#### 5.3 Board Tabs
**Changes**:
- Tabs: All | You | Rivals
- Place above rows
- Wire to existing filter logic
- **DO NOT ADD NEW STORE KEYS**

---

### Phase 6: Action Bar

#### 6.1 Simplify Action Bar
**File to Modify**: Action bar section

**Changes**:
- Keep ONLY: [Slot A][Slot B][Face-Up toggle][Submit][Clear][Leave]
- Remove any extra buttons or controls
- Submit remains disabled until existing rules allow
- **DO NOT ADD NEW VALIDATION**

---

### Phase 7: Global Styling

#### 7.1 Layout Grid
**File to Modify**: Main layout container

**Changes**:
- 12-column grid
- Max-width: 1280px
- Gutters: 16px
- Section order: Categories → Board → Hand
- Bottom action bar: fixed position

---

#### 7.2 Color & State Rules

**Panel Styling**:
- Neutral backgrounds (no gradients behind text)
- Only actionable elements use accent color
- "Scoring this round" outline uses accent

**Interaction States**:
- Hover: 4% fill + 1px keyline
- Active: 4% fill + 1px keyline + subtle shadow (0 2 6)

---

#### 7.3 Accessibility

**Requirements**:
- All icon buttons get aria-labels
- Hit areas: minimum 44×44px
- Popovers close on Esc or outside click
- Keyboard navigation support

---

### Phase 8: Component Cleanup

#### 8.1 Remove Elements
**Files to Modify**: All WarFaire UI components

**Removals**:
- ALL emoji from UI components
- Number overlays on card art
- Extra glyphs and redundant indicators

**Keep**:
- All existing event handlers
- All game logic
- All prop interfaces
- All API/socket calls

---

### Phase 9: QA Checks

#### 9.1 Functional Testing
**Verify**:
- ✅ Selecting 2 cards face-up fills slots correctly
- ✅ Selecting 1 up + 1 down fills slots correctly
- ✅ Submit enables exactly as current logic dictates
- ✅ Category tile popover reads existing totals and round deltas
- ✅ NO additional data fetches introduced

#### 9.2 Visual Testing
**Verify**:
- ✅ All emoji replaced with Icon components
- ✅ Cards use CardShell with proper regions
- ✅ ValueBadge shows number only, no overlay on art
- ✅ Face-down cards use CardBack component
- ✅ Categories use 2-column grid with LeaderChip
- ✅ Board rows use MiniCardChip for cards
- ✅ Action bar contains only specified elements

---

## 📦 Component Summary for WarFaire

### New Components to Create (Presentation Only)

1. **Icon** `({name, size})`
   - Maps category IDs to icon graphics
   - 24px or 16px variants
   - Line icons, 2px stroke, rounded caps

2. **CardShell** `({children})`
   - 5:7 aspect ratio, radius 8, keyline 1
   - Regions: TL icon, TR badge, center art, bottom name
   - Container for card content

3. **ValueBadge** `({value})`
   - Number-only pill
   - Top-right position in CardShell

4. **CardBack** `({label})`
   - Pattern + "next fair" chip
   - Used when Face-Up toggle off

5. **LeaderChip** `({avatarUrl, points, delta})`
   - 24px avatar + badge + delta
   - Shows leader and gap to second

6. **MiniCardChip** `({iconName, value})`
   - Icon + value for board rows
   - Compact card representation

---

## 🚀 Implementation Strategy

### Order of Implementation
1. ✅ Foundation (assets folder, tokens, Icon system)
2. ✅ Card components (CardShell, ValueBadge, CardBack)
3. ✅ Category section (grid, LeaderChip, popover)
4. ✅ Hand section (CardShell rendering, selection states)
5. ✅ Board section (rows, MiniCardChip, tabs)
6. ✅ Action bar (simplification)
7. ✅ Global styling (layout, colors, accessibility)
8. ✅ Component cleanup (remove emoji, overlays)
9. ✅ QA testing (functional + visual verification)

### Testing After Each Phase
- Verify game logic still works
- Check existing handlers still fire
- Ensure no new API calls introduced
- Confirm accessibility requirements met

---

## 📝 Notes

- This document should be updated as work progresses
- Mark items as complete with timestamps
- Add any discovered issues to appropriate sections
- Keep socket disconnect bug investigation separate
