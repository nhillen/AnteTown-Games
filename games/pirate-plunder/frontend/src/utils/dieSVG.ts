// Premium SVG dice renderer for Pirate Plunder
// Returns clean, scalable dice with proper bevels, glows, and vector pips

export interface DieOptions {
  size?: number;
  value?: 1 | 2 | 3 | 4 | 5 | 6;
  skin?: string;
  pipStyle?: string;
  glow?: {
    color: string;
    strength: 'high' | 'low';
  } | null;
}

interface SkinConfig {
  face: string;
  edge: string;
  pip: string;
}

interface GlowConfig {
  blur: number;
  stroke: number;
  opacity: number;
}

const SKINS: Record<string, SkinConfig> = {
  bone: { face: '#f8f6ea', edge: '#9a8f76', pip: '#111827' },
  pearl: { face: '#f3f5fb', edge: '#9aa5b1', pip: '#3f3f46' },
  brass: { face: '#f3d277', edge: '#c28a13', pip: '#0b0b0b' },
  ebony: { face: '#1f2430', edge: '#0f131a', pip: '#e5e7eb' },
  seaglass: { face: '#b9efe6', edge: '#1b8a7f', pip: '#0b0b0b' },
  obsidian: { face: '#0d0f14', edge: '#0b0e12', pip: '#a78bfa' }
};

const GLOW_CONFIGS: Record<string, GlowConfig> = {
  high: { blur: 12, stroke: 8, opacity: 1.0 },
  low: { blur: 8, stroke: 6, opacity: 0.7 }
};

// Tiny color mixer for gradients
function mixColor(hex1: string, hex2: string, amount = 0.5): string {
  const h = (n: string) => parseInt(n, 16);
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  
  const [r1, g1, b1] = [1, 3, 5].map(i => h(hex1.slice(i, i + 2)));
  const [r2, g2, b2] = [1, 3, 5].map(i => h(hex2.slice(i, i + 2)));
  
  const r = lerp(r1, r2, amount);
  const g = lerp(g1, g2, amount);
  const b = lerp(b1, b2, amount);
  
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

export function dieSVG(options: DieOptions = {}): string {
  const {
    size = 40,
    value = 6,
    skin = 'bone',
    pipStyle = 'dots',
    glow = null
  } = options;

  // Expand canvas size when glow is present
  const glowPadding = glow ? 16 : 0;
  const canvasSize = size + glowPadding * 2;
  const dieOffset = glowPadding;

  const pad = size * 0.14;
  const cornerRadius = size * 0.18;
  const pipRadius = size * 0.08;

  const skinConfig = SKINS[skin] || SKINS.bone;
  const glowConfig = glow ? GLOW_CONFIGS[glow.strength] : null;
  
  // Generate unique IDs to avoid conflicts when multiple dice are rendered
  const filterId = `filter-${Math.random().toString(36).substr(2, 9)}`;
  const pipShadowId = `pip-shadow-${Math.random().toString(36).substr(2, 9)}`;
  const bevelId = `bevel-${Math.random().toString(36).substr(2, 9)}`;
  const faceGradId = `face-grad-${Math.random().toString(36).substr(2, 9)}`;

  // Calculate pip positions using keypad layout (1-9)
  const getPipPosition = (keypadPos: number) => {
    const col = ((keypadPos - 1) % 3);
    const row = Math.floor((keypadPos - 1) / 3);
    const x = dieOffset + pad + (col + 0.5) * ((size - 2 * pad) / 3);
    const y = dieOffset + pad + (row + 0.5) * ((size - 2 * pad) / 3);
    return { x, y };
  };

  // Pip layouts for each face value
  const pipLayouts: Record<number, number[]> = {
    1: [5],           // center
    2: [1, 9],        // corners
    3: [1, 5, 9],     // diagonal
    4: [1, 3, 7, 9],  // four corners
    5: [1, 3, 5, 7, 9], // four corners + center
    6: [1, 3, 4, 6, 7, 9] // two columns
  };

  const layout = pipLayouts[value] || [5];

  // Render different pip styles
  const renderPip = (pos: { x: number; y: number }) => {
    if (pipStyle === 'coins') {
      return `
        <g transform="translate(${pos.x},${pos.y})">
          <circle r="${pipRadius}" fill="${skinConfig.pip}" filter="url(#${pipShadowId})"/>
          <circle r="${pipRadius * 0.55}" fill="none" stroke="#ffffffaa" stroke-width="${pipRadius * 0.18}"/>
        </g>
      `;
    } else if (pipStyle === 'runes') {
      const d = pipRadius * 0.9;
      return `
        <rect x="${pos.x - d}" y="${pos.y - d}" width="${d * 2}" height="${d * 2}" 
          rx="${pipRadius * 0.2}" fill="${skinConfig.pip}" filter="url(#${pipShadowId})"/>
      `;
    } else if (pipStyle === 'anchors') {
      const scale = pipRadius / 4;
      return `
        <g transform="translate(${pos.x},${pos.y}) scale(${scale})">
          <path d="M0,-3 L0,2.5 M-2,0.5 L2,0.5 M-2.5,2.5 C-2.5,3.5 -1.5,3.5 -1,2.5 M2.5,2.5 C2.5,3.5 1.5,3.5 1,2.5" 
            stroke="${skinConfig.pip}" stroke-width="0.8" fill="none" filter="url(#${pipShadowId})"/>
        </g>
      `;
    } else if (pipStyle === 'skulls') {
      const scale = pipRadius / 4;
      return `
        <g transform="translate(${pos.x},${pos.y}) scale(${scale})">
          <ellipse rx="2.5" ry="3" fill="${skinConfig.pip}" filter="url(#${pipShadowId})"/>
          <circle cx="-0.8" cy="-0.5" r="0.4" fill="${skinConfig.face}"/>
          <circle cx="0.8" cy="-0.5" r="0.4" fill="${skinConfig.face}"/>
          <path d="M0,0.5 L-0.4,1.5 L0.4,1.5 Z" fill="${skinConfig.face}"/>
        </g>
      `;
    }
    
    // Default: classic dots
    return `<circle cx="${pos.x}" cy="${pos.y}" r="${pipRadius}" fill="${skinConfig.pip}" filter="url(#${pipShadowId})"/>`;
  };

  const pips = layout.map(keypadPos => renderPip(getPipPosition(keypadPos))).join('');

  // Adjust glow intensity based on die value (4-6 slightly stronger) - only if glow is enabled
  const glowBlur = glowConfig ? glowConfig.blur * (value >= 4 ? 1.1 : 0.8) : 0;
  const glowStroke = glowConfig ? glowConfig.stroke : 0;
  const glowOpacity = glowConfig ? glowConfig.opacity : 0;

  return `
<svg width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Die showing ${value}">
  <defs>
    <!-- Outside glow filter with double layer for visibility -->
    <filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${glowBlur}" result="blur1"/>
      <feGaussianBlur stdDeviation="${glowBlur * 0.5}" result="blur2"/>
      <feMerge>
        <feMergeNode in="blur1"/>
        <feMergeNode in="blur2"/>
      </feMerge>
    </filter>

    <!-- Pip drop shadow -->
    <filter id="${pipShadowId}" x="-50%" y="-50%" width="200%" height="200%">
      <feOffset dx="0" dy="0.6" result="offset"/>
      <feGaussianBlur in="offset" stdDeviation="0.6" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.45 0"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Bevel gradient for premium look -->
    <linearGradient id="${bevelId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="0.6" stop-color="#000000" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </linearGradient>

    <!-- Face gradient for depth -->
    <linearGradient id="${faceGradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skinConfig.face}"/>
      <stop offset="1" stop-color="${mixColor(skinConfig.face, '#000000', 0.12)}"/>
    </linearGradient>
  </defs>

  ${glow ? `<!-- Glow ring behind die -->
  <g filter="url(#${filterId})" opacity="${glowOpacity}">
    <rect x="${dieOffset + glowStroke * 0.5}" y="${dieOffset + glowStroke * 0.5}" 
          width="${size - glowStroke}" height="${size - glowStroke}"
          rx="${cornerRadius}" fill="none" stroke="${glow.color}" stroke-width="${glowStroke}"/>
  </g>` : ''}

  <!-- Die face with bevel -->
  <g>
    <rect x="${dieOffset + 1}" y="${dieOffset + 1}" width="${size - 2}" height="${size - 2}" 
          rx="${cornerRadius}" fill="url(#${faceGradId})" 
          stroke="${skinConfig.edge}" stroke-width="2"/>
    <!-- Bevel sheen overlay -->
    <rect x="${dieOffset + 1}" y="${dieOffset + 1}" width="${size - 2}" height="${size - 2}" 
          rx="${cornerRadius}" fill="url(#${bevelId})" style="mix-blend-mode:overlay"/>
    <!-- Subtle vignette -->
    <rect x="${dieOffset + 1}" y="${dieOffset + 1}" width="${size - 2}" height="${size - 2}" 
          rx="${cornerRadius}" fill="url(#${bevelId})" opacity="0.25"/>
  </g>

  <!-- Pips -->
  ${pips}
</svg>
  `.trim();
}