# 🎪 State Fair – Game Design Document (GDD)
(Working Title)

## 📘 Core Concept
County Fair is a strategic card game about showcasing produce and baked goods across a series of Fairs.
Players compete to win ribbons in multiple Categories (like Carrots, Pies, Pumpkins, etc.) that belong to Groups (like Produce, Baking, Livestock).
Players choose which cards to play now and which to hold face-down for the next Fair, balancing short-term wins against long-term advantage.
The game rewards adaptability: categories rise and fall in prestige between Fairs, and the competition intensifies as more players join in.

## 🎴 Base Components

| Component | Description |
|-----------|-------------|
| Deck | 12 Categories × 13 Value Cards each (2,2,2,2,3,3,3,3,4,4,5,5,6) |
| Groups | 3 Groups (e.g., Produce, Baking, Livestock) each containing 4 active Categories |
| | Each Group contains 6 Group Cards (2,2,3,3,4,4,5,5) for 24 total group cards |
| Ribbons | Gold (3 pts), Silver (2 pts), Bronze (1 pt) — values can increase via progression |
| Players | 4–10 |
| Fairs | The game is played over multiple "Fairs" (round sets). Each Fair represents one competition season. |

## 🧭 Active Rule Set (CURRENT VERSION)

### 🎡 Setup
1. Take 1 card from each category and shuffle them together.
2. Draw category cards until you have 1 more than the number of players.
3. These are the active Categories (out of 12) to appear at the first Fair.
4. Each Category starts with no Prestige and base Ribbon values:
   - Ribbon Values = Gold 2 / Silver 1 / Bronze 0.
5. Create the starting Deck out of all the cards for each select category, plus all 3 sets of Group Cards.
6. Each player draws 3 cards before the First State Fair, Round 1, and places them face down in order for Round 1, Round 2 and Round 3. These will be the face down cards to flip for the first Fair, and this player is the only one to know it what they contain until then.

**Card Value Distribution**
In the future, the value distribution may be unique for each Group, and even each category. For example, Pigs might have values of 50lbs, 100lbs, 200lbs, etc. This would be purely cosmetic and help to differentiate the groups.

### 🔁 Round Structure
Each Fair has 3 rounds of play.

**Round 1**
1. Each player draws 3 cards.
2. Play all face down cards for this Round 2
3. Player chooses a category if they are group generic cards (eg Art, Produce, etc)
4. Play 1 card face-up (counts this Fair).
5. Play 1 card face-down (automatically activates in Round 1 of next Fair).

**Round 2**
- Same as Round 1 except face down cards are for Round 2

**Round 3**
- Same as Round 1 except face down cards are for Round 3

### 🧮 Scoring

**For Each Category**, tally the total value of all cards played this Fair for each player. Then award 🥇Gold to the highest value, 🥈Silver to the next highest, and 🥉Bronze to the 3rd highest. In case of ties, give both players the medal and skip the one below it.

*Example*: In the category Pumpkin (Produce) John played a 3 and a 6, for a total value of 9. Mary played a 4 and a 5, also getting 9. Alex played a 7. John and Mary both get Gold and Alex gets Bronze.

Ribbons are worth Victory Points according to the category prestige in which they are earned.

Top 3 players in each Category earn Ribbons:
- 🥇 Gold – base 2 VP
- 🥈 Silver – base 1 VP
- 🥉 Bronze – base 0 VP

Add Category Prestige to the VP earned for the ribbon. So if a category has 2 prestige, then a Gold is worth 4 VP, Silver is 3VP and a Bronze is 2VP.

**Group Winners**
Within each Group (containing up to 4 Categories):
- Each player totals VP from Ribbon Points earned from those Categories.
- The player with the highest VP total wins the Group.

### 🔼 Progressive Category Value System
At the end of each Fair:
1. Rank all Categories by their total points across all players.
2. The Top 3 Categories each gain +1 Prestige (to Gold, Silver, Bronze).
3. Example: "Carrots" (🥇3/🥈2/🥉1) next Fair if it finished top-3 in the first Fair.
4. In case of ties for 3rd place, all tied categories gain the bonus.
5. If there are fewer than 10 players, the Lowest-ranked Category is retired for the next Fair and replaced by one of the inactive/missing Categories from the deck.

If there is a Tie, remove the lowest prestige category. If there is still a tie, remove any 0 prestige categories and leave the rest.

Replace each removed category with one new category.

Newly introduced Categories start at base prestige.

**NOTE**: This may cause face down cards to have no valid category. Which means that card cannot score.

This creates dynamic prestige shifts. Popular or dominant categories become more lucrative, while underperformers cycle out. This means predicting the prestige and playing for the next Fair can be a winning strategy.

### Next Fair
At the start of the next Fair, discard all cards in players hands, played cards and cards remaining in the deck. Remove any banished category cards and add the new Category Cards. Then shuffle these cards to create the new deck (Note: the face down cards will be missing from the new deck) Then start at Round 1.

**Draw & Deck Flow**
Each player's total cards drawn per Fair:
- Round 1: +3
- Round 2: +3
- Round 3: +3
- = 9 cards per Fair, but only 6 are played (1 face down and 1 face up every round).

Cards you do not play are held in your hand until the end of the fair.

Cards face-down for the next Fair count as your opening play there.

### 👥 Player Count Scaling
*This is AI calculation. We should target higher player counts.*

| Players | Adjustment |
|---------|------------|
| 4–5 | Play 7 active Categories. |
| 6–8 | Optionally raise active Categories to 8 to preserve deck diversity. |
| 9+ | Use alternating Fair Groups or split tables; aggregate Category Prestige globally. |

## 🧩 Design Intent
- Encourage prediction and timing rather than raw luck.
- Add evolving meta-categories that become hotly contested or fall out of favor.
- Keep later Fairs fresh by rotating the competition space.
- Enable large player participation without overwhelming calculation.

## ⚙️ Variant Rule Library

### 🂡 Variant A – "No Holdover"
**Description:** Players play all cards face-up each Fair; no face-down future play.

**Pros:**
- Simple, easier to teach.
- Faster rounds.

**Cons:**
- Less long-term planning; Fairs feel isolated.
- Could add a residual (start next Fair with half value in each category that you ended with)

### 🂢 Variant B – "Face-Down Carry"
**Description:** Each round, players must play 1 card face-down that auto-plays next Fair.

**Pros:**
- Adds hidden information and forward planning.
- Creates rhythm between Fairs.

**Cons:**
- Slightly slower; requires remembering next-Fair triggers.
- (Active Variant — this is our current rule.)

### 🂣 Variant C – "Hand Carryover"
**Description:** Players keep up to 2 cards between Fairs as part of their next draw.

**Pros:**
- Emphasizes personal planning and combo-building.

**Cons:**
- Increases bookkeeping; possible snowball advantage.

### 🂤 Variant D – "Category Diminishing Returns"
**Description:** A player's 2nd card in the same Category counts for half value.

**Pros:**
- Prevents dogpiling a single category.

**Cons:**
- Slight complexity; can discourage focus strategies.

### 🂥 Variant E – "Top-Two Group Score"
**Description:** Each Group score = sum of a player's two best Category scores within that Group.

**Pros:**
- Rewards spreading effort.

**Cons:**
- More math; reduces payoff for full sweeps.

### 🂦 Variant F – "Static Category Prestige"
**Description:** Categories do not gain or lose Ribbon value between Fairs.

**Pros:**
- Consistency for teaching games.

**Cons:**
- Removes the evolving meta-game tension.

### Other optional Rules
- Winning 3 ribbons in a group is worth 1 pt.
- Categories start randomly with 0-2 prestige
- Special play cards, like something that gives you 1,2,3 points for all Categories in a group.

## 🎯 Current Active Rule Set Summary

### ✅ Active Variants:
- Variant B: Face-Down Carry
- Progressive Category Value System (Top 3 gain +1 Ribbon each Fair)
- 7 of 12 active Categories (rotating; lowest replaced each Fair)
- 3 Groups with 4 Categories each
- Ribbons start at 2/1/0 and can escalate
- Start game with 1 face down card
- Draw  3 → 3 → 3 across rounds (play 3 up + 3 down minimum)
- 4+ players supported
- No discarding each round
