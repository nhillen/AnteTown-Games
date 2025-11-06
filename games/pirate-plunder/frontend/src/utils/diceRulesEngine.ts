// Dice Combination Rules Engine
// Ensures every combo is valid, readable, and feels intentional

export interface DiceCombo {
  skin: string;
  material: string;
  value?: number;
  pipStyle?: string;
  effects?: Array<{
    type: 'glow' | 'aura' | 'sparkles' | 'rim-marquee';
    style?: 'pulse' | 'electric';  // For aura
    strength?: 'high' | 'low';     // For glow
    color?: string;
    count?: number;                // For sparkles
  }>;
  tint?: string;
  pipColor?: string;
  rarity?: string;
  complexity?: number;
}

// Palettes from existing skins
const SKINS = {
  bone:     { face: "#F6F3E6", edge: "#9A8F76", pip: "#0E1116" },
  pearl:    { face: "#F4F7FD", edge: "#9AA5B1", pip: "#30323A" },
  brass:    { face: "#F1D06C", edge: "#B87D12", pip: "#0B0B0B" },
  ebony:    { face: "#212632", edge: "#0F131A", pip: "#E8EAEE" },
  ocean:    { face: "#B7F0E7", edge: "#17867B", pip: "#0B0B0B" },
  obsidian: { face: "#0E1117", edge: "#0B0E12", pip: "#BAA7FF" }
};

const MATERIALS = ["solid", "frostedGlass", "clearGlass", "ghost"];
const EFFECTS = ["glow", "aura", "sparkles", "rim-marquee"];
// const RARITIES = ["Swabbie", "Deckhand", "Corsair", "Captain", "Kraken"]; // Unused for now

// 1) Constraints by material
const MATERIAL_RULES = {
  solid: {
    allowTint: false,
    allowEffects: ["glow", "aura", "sparkles", "rim-marquee"],
    maxEffects: 3  // glow + 2 other effects
  },
  frostedGlass: {
    allowTint: true,
    tintAlpha: [0.08, 0.18],
    allowEffects: ["glow", "aura", "sparkles", "rim-marquee"],
    maxEffects: 3
  },
  clearGlass: {
    allowTint: true,
    tintAlpha: [0.10, 0.22],
    allowEffects: ["glow", "aura", "sparkles", "rim-marquee"],
    maxEffects: 3
  },
  ghost: {
    allowTint: true,
    tintAlpha: [0.00, 0.12],
    allowEffects: ["glow", "aura", "sparkles", "rim-marquee"],
    maxEffects: 4  // glow + up to 3 other effects
  }
};

// 2) Effect compatibility guards
function effectConflicts(effects: DiceCombo['effects'] = []): string[] {
  // Do not stack electric aura and rim marquee at once
  const hasElectric = effects.some(e => e.type === "aura" && e.style === "electric");
  const hasMarquee = effects.some(e => e.type === "rim-marquee");
  return hasElectric && hasMarquee ? ["aura:electric conflicts with rim-marquee"] : [];
}

// 3) Rarity budget (complexity points)
export function scoreCombo(o: DiceCombo): number {
  const matPts = ({ solid: 1, frostedGlass: 2, clearGlass: 3, ghost: 4 } as any)[o.material] ?? 1;
  const pipPts = o.pipStyle === "coins" ? 1 : 0;
  const effPts = (o.effects || []).reduce((s, e) => {
    if (e.type === "glow" && e.strength === "high") return s + 2;
    if (e.type === "glow") return s + 1;
    if (e.type === "aura" && e.style === "electric") return s + 3;
    if (e.type === "aura") return s + 2;
    if (e.type === "sparkles") return s + 2;
    if (e.type === "rim-marquee") return s + 3;
    return s;
  }, 0);
  const extra = Math.max(0, (o.effects || []).length - 2) * 2; // -2 because glow is now an effect
  return matPts + pipPts + effPts + extra;
}

export function rarityFromScore(score: number): string {
  if (score <= 3) return "Swabbie";
  if (score <= 6) return "Deckhand";
  if (score <= 9) return "Corsair";
  if (score <= 12) return "Captain";
  return "Kraken";
}

// 4) Glow strength defaults by die value
function defaultGlowStrength(value?: number): 'high' | 'low' {
  const v = typeof value === "number" ? value : 6;
  return v >= 4 ? "high" : "low";
}

// Helpers for contrast
function luma(hex: string): number {
  const c = (n: number) => parseInt(hex.slice(n, n + 2), 16) / 255;
  const [r, g, b] = [1, 3, 5].map(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ensureReadablePip(face: string, pip: string): string {
  const L1 = luma(face), L2 = luma(pip);
  const contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  if (contrast >= 3.8) return pip;
  return L1 > 0.5 ? "#0b0b0b" : "#f5f5f5";
}

// 5) Main normalize + validate
export function normalizeCombo(input: DiceCombo): DiceCombo {
  const o = structuredClone(input);

  // Sanitize enums
  o.skin = o.skin in SKINS ? o.skin : "bone";
  o.material = MATERIALS.includes(o.material) ? o.material : "solid";
  o.pipStyle = (o.pipStyle === "coins") ? "coins" : "classic";
  o.effects = Array.isArray(o.effects) ? o.effects.filter(e => EFFECTS.includes(e.type)) : [];

  // Ensure glow effect exists with proper defaults
  const glowEffect = o.effects.find(e => e.type === "glow");
  if (glowEffect) {
    // Set default strength if not specified
    if (!glowEffect.strength) {
      glowEffect.strength = defaultGlowStrength(o.value);
    }
    // Set default color if not specified
    if (!glowEffect.color) {
      glowEffect.color = "#F59E0B";
    }
  }

  // Clamp effects by material
  const mr = MATERIAL_RULES[o.material as keyof typeof MATERIAL_RULES];
  o.effects = o.effects.filter(e => mr.allowEffects.includes(e.type)).slice(0, mr.maxEffects);

  // Conflict cleanup
  const conflicts = effectConflicts(o.effects);
  if (conflicts.length) {
    // Drop rim-marquee if conflicting
    o.effects = o.effects.filter(e => !(e.type === "rim-marquee"));
  }

  // Pip contrast guard
  const pal = SKINS[o.skin as keyof typeof SKINS];
  o.pipColor = ensureReadablePip(pal.face, pal.pip);

  // Tint rule for glass
  if (!mr.allowTint) o.tint = undefined;
  if (o.tint && 'tintAlpha' in mr && mr.tintAlpha) {
    // Optionally enforce alpha range if you store as rgba
  }

  // Score and rarity
  const score = scoreCombo(o);
  o.rarity = rarityFromScore(score);
  o.complexity = score;

  return o;
}

// 6) UI helper: which options to show or disable
export function allowedOptionsFor(material: string) {
  const mr = MATERIAL_RULES[material as keyof typeof MATERIAL_RULES] || MATERIAL_RULES.solid;
  return {
    maxEffects: mr.maxEffects,      // 3 or 4
    allowTint: mr.allowTint,        // boolean
    allowEffects: mr.allowEffects   // list of effect types including 'glow'
  };
}