# 🎮 Game Design Document — Last Breath

## 1. Overview

### Concept:
A deterministic, push-your-luck survival game where players descend through a derelict structure, gathering data as their oxygen runs out. Each step deepens corruption—granting both power and risk. Players can exfiltrate at any time to secure their gains, or press on for greater rewards at escalating peril.

### Tone:
Tense, claustrophobic, "one more room" greed.
The player's goal is to survive as long as possible while maximizing data extracted.

### Core Fantasy:
You're breathing borrowed air. Every breath counts.

## 2. Gameplay Loop

### Summary

Players explore a sequence of procedurally determined "rooms."
- Each room grants rewards but consumes oxygen, damages the suit, and increases corruption.
- Corruption boosts both rewards and danger.
- One catastrophic failure ends the run.

### Loop Diagram
```
Start Run → Explore Room → Check Fail → Decide:
                             ↓
                     [Exfiltrate] —> End (payout)
                             ↳ [Advance] —> Next Room
```

### Player Actions

| Action | Description |
|--------|-------------|
| Advance | Enter the next room. Risk increases, reward multiplier grows. |
| Exfiltrate | End the run and secure the current data multiplier as payout. |
| Patch (optional) | Spend time to reduce corruption by 1 and lower next-step hazard, but halve this step's reward. |

## 3. Player Stats

| Variable | Range | Description |
|----------|-------|-------------|
| O2 | 0–100 | Oxygen supply. Depletes each Advance and from leaks. |
| Suit Integrity | 0.0–1.0 | Degrades slowly; reaching 0 = failure. |
| Corruption (K) | 0+ | Increases through events; increases both reward and hazard. |
| Data Multiplier (M) | ≥1.00 | The payout multiplier; grows each step. |
| Depth (i) | Integer | The number of rooms entered. |

## 4. Core Math and Systems

### Reward Growth

Each Advance grants an incremental gain:

```
gain = rand(μ_min, μ_max)
      + (surge_event ? rand(α_min, α_max) : 0)
      + λ * K
```

Meaning:
- μ = baseline small reward
- α = surge reward (rare big bump)
- λ = corruption-based reward boost

### Hazard Probability

```
q(i, K) = clamp(q0 + a * i + β * K, 0, 0.95)
```

Where:
- q0 = base hazard chance
- a = per-depth hazard increase
- β = hazard increase per corruption

Each Advance rolls `Random() < q(i,K)` for catastrophic failure.

### Oxygen & Suit

```
O2_next = O2 - o2_base - K
Suit_next = clamp(Suit - rand(decay_min, decay_max), 0, 1)
```

If `O2 ≤ 0` or `Suit ≤ 0`, the run ends immediately.

### Expected Value (EV) Curve

Approximation:

```
EV(s) ≈ S(s) × M_s
S(s) = Π_{i=1..s} (1 - q(i,K))
M_s = M_0 + Σ_i gain_i
```

This produces the same "rising then crashing" EV shape as a crash/ace game but with multiple interacting state variables (depth, corruption, oxygen), making the curve feel organic, not geometric.

## 5. Events and Corruption System

| Event | Probability | Effect |
|-------|-------------|--------|
| Micro-Leak | 10% | +1 Corruption; increases future O2 drain. |
| Air Canister | 7% | O2 +20; +0.10× Data; +1 Corruption. |
| Structural Brace | 5% | Suit Integrity +0.05. |
| Surge Event | 12% | +[0.18–0.30]× Data; +1 Corruption. |

**Design Intent:**
Positive events create greed—they feel good but add corruption, driving up risk and payouts simultaneously.

## 6. Deterministic Randomness and Replays

### Seeded RNG

Use a deterministic pseudorandom generator such as Mulberry32 or Xoshiro128.
Every event in the run must pull random numbers from this generator in strict order.

```javascript
function mulberry32(a) {
    let t = a >>> 0;
    return function() {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ t >>> 15, 1 | t);
        r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
        return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
}
```

### Seed Composition

```
runSeed = hash32(serverSecret, tableID, userID, timestamp, nonce)
rng = mulberry32(runSeed)
```

### Replay Guarantee

Store:
- runSeed
- ordered list of player actions
- rngCount (how many RNG calls consumed)

You can replay the entire run exactly for verification or simulation.

## 7. Server Authority and Fairness

- The server generates the seed and is authoritative over each RNG call.
- The client sends only actions (advance, exfiltrate, patch).
- After the run, expose the runSeed for transparency.
- Optionally provide a "verify" endpoint that replays steps and returns a hash digest.

## 8. RTP (Return to Player) Measurement

### Definition

RTP = expected payout ÷ wager.
Here, "payout" = data multiplier M at exfiltration or 0 on failure.

Because players can choose when to stop, define RTP as a function of strategy.

### RTP(strategy S)

Expected payout under stopping rule S.

### RTP_opt

Maximum RTP achievable under a rational strategy (upper bound).

### RTP_empirical

Average RTP across live user sessions.

### Simulation Approach

#### A. Threshold Policy Sweep (Simple)

Evaluate across a grid of humanlike stopping rules:

| Rule | Example Parameter |
|------|-------------------|
| Hazard Threshold | stop when q(i,K) > 0.15 |
| Depth Cap | stop at depth ≥ 8 |
| Resource Floor | stop if O2 ≤ 20 or Suit ≤ 0.3 |
| Mixed | stop when any of the above triggers |

Run Monte Carlo simulations (10k+ runs) using different seeds:

```
RTP(π) = mean(payouts under policy π)
RTP_opt = max_π RTP(π)
```

#### B. Dynamic Programming (Optional)

For theoretical max, solve Bellman equation:

```
V(s) = max{ M, E[V(s') | advance from s] }
```

Discretize state space (O2, Suit, K) to approximate the optimal stopping policy.

### Simulation Harness Pseudocode

```javascript
function playRun(rng, cfg, policy) {
    let s = initState(cfg);
    while (true) {
        const qNext = hazardNext(s, cfg);
        const decision = policy(s, qNext, cfg);

        if (decision === "exfiltrate") return s.M;

        s = stepAdvance(rng, s, cfg);
        if (s.bust) return 0;
    }
}

function simulateRTP(nRuns, seed0, cfg, policy) {
    let sum = 0;
    for (let i = 0; i < nRuns; i++) {
        const rng = mulberry32(seed0 + i);
        sum += playRun(rng, cfg, policy);
    }
    return sum / nRuns;
}
```

Example policies:

```javascript
function policyHazard(s, qNext) {
    return qNext > 0.18 ? "exfiltrate" : "advance";
}

function policyMixed(s, qNext) {
    if (s.O2 <= 20 || s.Suit <= 0.3) return "exfiltrate";
    if (qNext > 0.20) return "exfiltrate";
    return "advance";
}
```

## 9. Low-Visual Frontend Prototype (React)

### Presentation Goals

- Feel game-like and thematic, not casino-like.
- Use minimal visuals: one "room" modal, brief wipes, textual feedback.
- Display only key stats (O2, Suit, Corruption, Data).
- Use subtle text color changes to communicate danger.
- Core Interaction: Advance → quick wipe → reveal next room outcome.

You can use the React prototype provided earlier for this section. It uses:
- A quick gradient wipe to reveal room content.
- Deterministic RNG sequence driven by seed.
- Simple log window for recent events.

## 10. Balancing Parameters (Default Config)

```json
{
    "start": { "O2": 100, "Suit": 1.0, "M0": 1.00 },
    "costs": { "O2Base": 5 },
    "rewards": { "muMin": 0.008, "muMax": 0.018, "pSurge": 0.12, "surgeMin": 0.18, "surgeMax": 0.30 },
    "hazard": { "q0": 0.02, "a": 0.010, "beta": 0.020, "lambda": 0.008 },
    "events": { "leakP": 0.10, "canisterP": 0.07, "stabilizeP": 0.05 },
    "patch": { "enabled": true, "qReduction": 0.03, "rewardPenalty": 0.5 }
}
```

**Expected Behavior:**
- Safe first few rooms (~1.02–1.05× EV).
- EV peak around room 7–9 (~1.10–1.12×).
- Rapid drop after depth 10 as corruption accelerates.
- Optimal RTP (best threshold policy): ~96–98%.

## 11. Key Design Advantages

| Design Element | Player Intuition | Math Benefit |
|----------------|------------------|--------------|
| O2 | Visible timer | Smoothly rising risk |
| Suit | Soft health bar | Extra fail dimension |
| Corruption | Greed metric | Coupled reward & hazard |
| Air Canisters | Temptation event | Creates EV spikes |
| Deterministic Seed | Fairness + replay | Allows RTP simulation & auditing |
| Policy-based RTP | Skill metric | Quantifiable "skill-based" classification |

## 12. Next Steps

### Backend Implementation
- Deterministic RNG (seeded with runSeed).
- Stateless advance() endpoint (inputs: run_id, action, n_rng).
- Logging of full RNG consumption and resulting state.
- Batch simulation utility for RTP sweeps.

### Frontend Prototype
- Use existing React "room" mock.
- Add seed injection for debugging.
- Add Replay Viewer: step through run by seed.

### Analytics
- Record per-depth payouts and fail rates.
- Track empirical RTP and compare to simulated bounds.

### Balance Testing
- Run 10k seeds × multiple policies.
- Plot EV vs. depth and corruption.
- Tune λ, β, a to hit target peak and RTP.

## 13. Narrative Tagline

**"Every room takes your breath away. Literally."**

## 14. Deliverables

- `last_breath_config.json` (parameter set)
- `rng.js` (seeded RNG implementation)
- `simulation.js` (RTP sweeps + policy testing)
- `gameplay_react.jsx` (client prototype)
- `server_run_handler.js` (authoritative step + replay endpoint)
- `RTP_report.csv` (simulation output)
