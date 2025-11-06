// Unified Dice Renderer V2 - Materials + Effects System
// Replaces the old separate skin/pip/glow system

export interface DiceConfig {
  size?: number;
  value?: 1 | 2 | 3 | 4 | 5 | 6;
  skin?: SkinId;
  material?: MaterialType;
  tint?: string;  // Optional override for glass materials
  effects?: EffectConfig[];
}

export type SkinId = 'bone' | 'pearl' | 'brass' | 'ebony' | 'ocean' | 'obsidian';
export type MaterialType = 'solid' | 'frostedGlass' | 'clearGlass' | 'ghost';

export interface EffectConfig {
  type: 'glow' | 'aura' | 'sparkles' | 'rim-marquee';
  style?: 'pulse' | 'electric';  // For aura
  strength?: 'high' | 'low';     // For glow
  color?: string;
  count?: number;  // For sparkles
}

const SKINS: Record<SkinId, { face: string; edge: string; pip: string }> = {
  bone: { face: '#f8f6ea', edge: '#9a8f76', pip: '#111827' },
  pearl: { face: '#f3f5fb', edge: '#9aa5b1', pip: '#3f3f46' },
  brass: { face: '#f3d277', edge: '#c28a13', pip: '#0b0b0b' },
  ebony: { face: '#1f2430', edge: '#0f131a', pip: '#e5e7eb' },
  ocean: { face: '#b9efe6', edge: '#1b8a7f', pip: '#0b0b0b' },
  obsidian: { face: '#0d0f14', edge: '#0b0e12', pip: '#a78bfa' }
};

const PIP_LAYOUTS: Record<number, number[]> = {
  1: [5],           // center
  2: [1, 9],        // diagonal corners
  3: [1, 5, 9],     // diagonal line
  4: [1, 3, 7, 9],  // four corners
  5: [1, 3, 5, 7, 9], // four corners + center
  6: [1, 3, 4, 6, 7, 9] // two columns
};

// Shared filter definitions that need to be included in every SVG
const SHARED_FILTERS = `
  <!-- Pip drop shadow -->
  <filter id="dicePipShadow" x="-50%" y="-50%" width="200%" height="200%">
    <feOffset dx="0" dy="0.6" result="offset"/>
    <feGaussianBlur in="offset" stdDeviation="0.6" result="blur"/>
    <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0"/>
    <feMerge>
      <feMergeNode/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>

  <!-- Glow filters with large bounds to prevent clipping -->
  <filter id="diceGlowLow" x="-200" y="-200" width="500" height="500" filterUnits="userSpaceOnUse">
    <feGaussianBlur stdDeviation="8"/>
  </filter>
  <filter id="diceGlowHigh" x="-200" y="-200" width="500" height="500" filterUnits="userSpaceOnUse">
    <feGaussianBlur stdDeviation="12"/>
  </filter>

  <!-- Frost grain filter -->
  <filter id="diceGrain" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="turbulence"/>
    <feColorMatrix type="saturate" values="0" in="turbulence" result="monochrome"/>
    <feComponentTransfer in="monochrome">
      <feFuncA type="table" tableValues="0 0.06"/>
    </feComponentTransfer>
  </filter>

  <!-- Electric wobble for aura effects -->
  <filter id="diceElectric" x="-200" y="-200" width="500" height="500" filterUnits="userSpaceOnUse">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="9" result="turbulence"/>
    <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
`;

// Color mixing utility
function mixColor(hex1: string, hex2: string, amount = 0.5): string {
  const h = (n: string) => parseInt(n.slice(1), 16);
  const pad2 = (x: number) => x.toString(16).padStart(2, '0');
  
  const [r1, g1, b1] = [(h(hex1) >> 16) & 255, (h(hex1) >> 8) & 255, h(hex1) & 255];
  const [r2, g2, b2] = [(h(hex2) >> 16) & 255, (h(hex2) >> 8) & 255, h(hex2) & 255];
  
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const r = lerp(r1, r2, amount);
  const g = lerp(g1, g2, amount); 
  const b = lerp(b1, b2, amount);
  
  return '#' + pad2(r) + pad2(g) + pad2(b);
}

// Initialize shared SVG definitions (call once)
export function initDiceSharedDefs(): void {
  if (document.getElementById('dice-shared-defs')) return;
  
  const defsContainer = document.createElement('div');
  defsContainer.innerHTML = `
    <svg id="dice-shared-defs" width="0" height="0" style="position:absolute">
      <defs>
        <!-- Shared bevel gradient -->
        <linearGradient id="diceBevel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
          <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.12"/>
          <stop offset="0.6" stop-color="#000000" stop-opacity="0.10"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
        </linearGradient>

        <!-- Frost grain filter -->
        <filter id="diceGrain" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="turbulence"/>
          <feColorMatrix type="saturate" values="0" in="turbulence" result="monochrome"/>
          <feComponentTransfer in="monochrome">
            <feFuncA type="table" tableValues="0 0.06"/>
          </feComponentTransfer>
        </filter>

        <!-- Pip drop shadow -->
        <filter id="dicePipShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feOffset dx="0" dy="0.6" result="offset"/>
          <feGaussianBlur in="offset" stdDeviation="0.6" result="blur"/>
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0"/>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- Glow filters -->
        <filter id="diceGlowLow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8"/>
        </filter>
        <filter id="diceGlowHigh" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12"/>
        </filter>

        <!-- Electric wobble for aura effects -->
        <filter id="diceElectric" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="9" result="turbulence"/>
          <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="2" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
    </svg>
  `;
  
  document.body.appendChild(defsContainer);
}

// Material painters
function paintSolid(size: number, rad: number, skin: any, uniqueId: string): string {
  const faceDark = mixColor(skin.face, '#000000', 0.12);
  return `
    <defs>
      <linearGradient id="faceGrad-${uniqueId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${skin.face}"/>
        <stop offset="1" stop-color="${faceDark}"/>
      </linearGradient>
      ${SHARED_FILTERS}
    </defs>
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          fill="url(#faceGrad-${uniqueId})" stroke="${skin.edge}" stroke-width="2"/>
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          fill="url(#diceBevel)" style="mix-blend-mode:overlay"/>
  `;
}

function paintClearGlass(size: number, rad: number, skin: any, tint: string, uniqueId: string): string {
  const envTint = tint || skin.face;
  const tintTop = mixColor(envTint, '#ffffff', 0.4);
  const tintBot = mixColor(envTint, '#000000', 0.25);
  
  return `
    <defs>
      <linearGradient id="glassFill-${uniqueId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${tintTop}" stop-opacity="0.18"/>
        <stop offset="1" stop-color="${tintBot}" stop-opacity="0.12"/>
      </linearGradient>
      <linearGradient id="specStripe-${uniqueId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
        <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.06"/>
        <stop offset="0.65" stop-color="#000000" stop-opacity="0.10"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.25"/>
      </linearGradient>
      ${SHARED_FILTERS}
    </defs>
    <!-- Rim -->
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          fill="none" stroke="${mixColor(envTint, '#ffffff', 0.35)}" stroke-width="2"/>
    <!-- Translucent fill -->
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          fill="url(#glassFill-${uniqueId})"/>
    <!-- Specular stripe -->
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          fill="url(#specStripe-${uniqueId})" style="mix-blend-mode:screen" opacity="0.8"/>
  `;
}

function paintFrostedGlass(size: number, rad: number, skin: any, tint: string, uniqueId: string): string {
  return `
    ${paintClearGlass(size, rad, skin, tint, uniqueId)}
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          filter="url(#diceGrain)" style="mix-blend-mode:soft-light"/>
  `;
}

function paintGhost(size: number, rad: number, glowEffect?: EffectConfig): string {
  const rim = glowEffect?.color || '#a78bfa';
  const glowFilter = glowEffect?.strength === 'high' ? 'diceGlowHigh' : 'diceGlowLow';
  const glowOpacity = glowEffect?.strength === 'high' ? 0.9 : 0.6;

  return `
    <defs>
      ${SHARED_FILTERS}
    </defs>
    <rect x="2" y="2" width="${size-4}" height="${size-4}" rx="${rad}"
          fill="none" stroke="${rim}" stroke-opacity="0.65" stroke-width="1.5"/>
    <rect x="1" y="1" width="${size-2}" height="${size-2}" rx="${rad}"
          fill="none" stroke="${rim}" stroke-opacity="0.15" stroke-width="6"
          filter="url(#${glowFilter})" opacity="${glowOpacity}"/>
  `;
}

// Effect generators
function generateGlow(size: number, rad: number, effect: EffectConfig, dieOffset: number): string {
  const color = effect.color || '#f59e0b';
  const strength = effect.strength || 'low';
  const glowFilter = strength === 'high' ? 'diceGlowHigh' : 'diceGlowLow';
  const glowStroke = strength === 'high' ? 8 : 6;
  const glowOpacity = strength === 'high' ? 1.0 : 0.7;

  return `
    <g filter="url(#${glowFilter})" opacity="${glowOpacity}">
      <rect x="${dieOffset + glowStroke * 0.5}" y="${dieOffset + glowStroke * 0.5}"
            width="${size - glowStroke}" height="${size - glowStroke}"
            rx="${rad}" fill="none" stroke="${color}" stroke-width="${glowStroke}"/>
    </g>
  `;
}

function generateAura(size: number, _rad: number, effect: EffectConfig): string {
  const color = effect.color || '#f59e0b';
  const style = effect.style || 'pulse';
  const strength = effect.strength || 'low';
  const stroke = strength === 'high' ? 7 : 5;
  const opacity = strength === 'high' ? 0.95 : 0.55;
  const glowFilter = strength === 'high' ? 'diceGlowHigh' : 'diceGlowLow';

  const electricFilter = style === 'electric' ? ' filter="url(#diceElectric)"' : '';
  const animation = style === 'pulse' ? `
    <animate attributeName="opacity" values="${opacity};${opacity * 0.6};${opacity}"
             dur="1.6s" repeatCount="indefinite"/>` : '';

  // Use a circle for true circular glow (not rounded rectangle)
  const center = size / 2; // Center of canvas
  const radius = size * 0.3; // 30% of canvas size for generous circular glow

  return `
    <g opacity="${opacity}">
      <!-- Circular glow -->
      <circle cx="${center}" cy="${center}" r="${radius}"
              fill="none" stroke="${color}" stroke-width="${stroke * 2}"
              filter="url(#${glowFilter})"${electricFilter}>${animation}</circle>
    </g>
  `;
}

function generateSparkles(size: number, pad: number, effect: EffectConfig): string {
  const color = effect.color || '#ffffff';
  const count = effect.count || 6;
  const maxR = 1.2;
  
  // Place sparkles around the die area
  const box = { x: pad - 2, y: pad - 2, w: size - 2 * pad + 4, h: size - 2 * pad + 4 };
  let sparkles = '<g>';
  
  for (let i = 0; i < count; i++) {
    const x = (box.x + Math.random() * box.w).toFixed(2);
    const y = (box.y + Math.random() * box.h).toFixed(2);
    const r = (0.6 + Math.random() * maxR).toFixed(2);
    const delay = (Math.random() * 1.4).toFixed(2) + 's';
    
    sparkles += `
      <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0.0">
        <animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="${delay}" repeatCount="indefinite"/>
      </circle>
    `;
  }
  
  sparkles += '</g>';
  return sparkles;
}

function generateRimMarquee(size: number, rad: number, effect: EffectConfig): string {
  const color = effect.color || '#ffffff';
  const dash = Math.max(4, Math.round(size * 0.22));
  
  return `
    <g>
      <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${rad}"
            fill="none" stroke="${color}" stroke-width="2"
            stroke-dasharray="${dash} ${dash}" stroke-linecap="round">
        <animate attributeName="stroke-dashoffset" from="0" to="${dash * 2}"
                 dur="2.4s" repeatCount="indefinite"/>
      </rect>
    </g>
  `;
}

// Main renderer
export function renderDice(config: DiceConfig = {}): string {
  const {
    size = 40,
    value = 6,
    skin = 'bone',
    material = 'solid',
    tint,
    effects = []
  } = config;

  // Extract glow effect if present
  const glowEffect = effects.find(e => e.type === 'glow');

  // Expand canvas for glow effects - increased padding to prevent clipping
  const glowPadding = glowEffect ? 24 : 0;
  const canvasSize = size + glowPadding * 2;
  const dieOffset = glowPadding;

  const pad = size * 0.14;
  const rad = size * 0.18;
  const pipR = size * 0.08;
  
  const skinConfig = SKINS[skin] || SKINS.bone;
  const uniqueId = Math.random().toString(36).substr(2, 9);
  
  // Calculate pip positions
  const getPipPosition = (keypadPos: number) => {
    const col = ((keypadPos - 1) % 3);
    const row = Math.floor((keypadPos - 1) / 3);
    const x = dieOffset + pad + (col + 0.5) * ((size - 2 * pad) / 3);
    const y = dieOffset + pad + (row + 0.5) * ((size - 2 * pad) / 3);
    return { x, y };
  };

  // Render pips
  const pipFill = material === 'ghost' ? '#ffffff' : skinConfig.pip;
  const pipGlow = material === 'ghost';

  const pips = PIP_LAYOUTS[value].map(keypadPos => {
    const { x, y } = getPipPosition(keypadPos);

    if (pipGlow) {
      const glowFilter = glowEffect?.strength === 'high' ? 'diceGlowHigh' : 'diceGlowLow';
      return `
        <g>
          <circle cx="${x}" cy="${y}" r="${pipR * 1.25}" fill="${pipFill}"
                  opacity="0.25" filter="url(#${glowFilter})"/>
          <circle cx="${x}" cy="${y}" r="${pipR}" fill="${pipFill}"/>
        </g>
      `;
    }

    return `<circle cx="${x}" cy="${y}" r="${pipR}" fill="${pipFill}" filter="url(#dicePipShadow)"/>`;
  }).join('');

  // Select material painter
  let facePaint = '';
  switch (material) {
    case 'solid':
      facePaint = paintSolid(size, rad, skinConfig, uniqueId);
      break;
    case 'clearGlass':
      facePaint = paintClearGlass(size, rad, skinConfig, tint || skinConfig.face, uniqueId);
      break;
    case 'frostedGlass':
      facePaint = paintFrostedGlass(size, rad, skinConfig, tint || skinConfig.face, uniqueId);
      break;
    case 'ghost':
      facePaint = paintGhost(size, rad, glowEffect);
      break;
  }
  
  // Offset the face painting for glow padding
  if (dieOffset > 0) {
    facePaint = facePaint.replace(/x="1"/g, `x="${dieOffset + 1}"`)
                        .replace(/y="1"/g, `y="${dieOffset + 1}"`)
                        .replace(/x="2"/g, `x="${dieOffset + 2}"`)
                        .replace(/y="2"/g, `y="${dieOffset + 2}"`);
  }

  // Generate effects
  const behindEffects: string[] = [];
  const aboveEffects: string[] = [];

  effects.forEach(effect => {
    switch (effect.type) {
      case 'glow':
        behindEffects.push(generateGlow(size, rad, effect, dieOffset));
        break;
      case 'aura':
        behindEffects.push(generateAura(canvasSize, rad, effect));
        break;
      case 'sparkles':
        behindEffects.push(generateSparkles(canvasSize, pad + dieOffset, effect));
        break;
      case 'rim-marquee':
        // Offset for glow padding
        const offsetMarquee = generateRimMarquee(size, rad, effect).replace(/x="1"/g, `x="${dieOffset + 1}"`).replace(/y="1"/g, `y="${dieOffset + 1}"`);
        aboveEffects.push(offsetMarquee);
        break;
    }
  });

  return `
<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Die showing ${value}">

  ${behindEffects.join('')}

  ${facePaint}

  ${pips}

  ${aboveEffects.join('')}
</svg>
  `.trim();
}