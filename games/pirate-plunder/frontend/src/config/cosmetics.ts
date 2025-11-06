// Cosmetic customization options for Pirate Plunder

export type PlayerCosmetics = {
  // Identity
  banner: string;      // Banner skin ID
  emblem: string;      // Emblem/crest ID  
  title: string;       // Title prefix
  
  // Dice Collections - simplified to High/Low skin selection
  highSkin: string;    // Dice collection for high-value rolls (4-6)
  lowSkin: string;     // Dice collection for low-value rolls (1-3)
}

// Banner options (gradient + texture)
export const BANNERS = {
  'classic': { 
    name: 'Classic',
    gradient: 'from-slate-800 to-slate-900',
    texture: '',
    nameColor: 'text-white'
  },
  'corsair': {
    name: 'Corsair',
    gradient: 'from-red-900/30 to-slate-900',
    texture: 'opacity-20 bg-gradient-to-r from-transparent via-red-800/10 to-transparent',
    nameColor: 'text-red-200'
  },
  'royal': {
    name: 'Royal Navy',
    gradient: 'from-blue-900/30 to-slate-900',
    texture: 'opacity-20 bg-gradient-to-r from-transparent via-blue-800/10 to-transparent',
    nameColor: 'text-blue-200'
  },
  'ghost': {
    name: 'Ghost Ship',
    gradient: 'from-purple-900/30 to-slate-900',
    texture: 'opacity-20 bg-gradient-to-r from-transparent via-purple-800/10 to-transparent',
    nameColor: 'text-purple-200'
  },
  'treasure': {
    name: 'Treasure Hunter',
    gradient: 'from-yellow-900/30 to-slate-900',
    texture: 'opacity-20 bg-gradient-to-r from-transparent via-yellow-800/10 to-transparent',
    nameColor: 'text-yellow-200'
  }
};

// Emblem/crest options
export const EMBLEMS = {
  'none': { name: 'None', icon: '' },
  'anchor': { name: 'Anchor', icon: '⚓' },
  'skull': { name: 'Skull', icon: '☠️' },
  'compass': { name: 'Compass', icon: '🧭' },
  'kraken': { name: 'Kraken', icon: '🐙' },
  'crown': { name: 'Crown', icon: '👑' },
  'coin': { name: 'Coin', icon: '🪙' },
  'wheel': { name: 'Wheel', icon: '☸️' }
};

// Title prefixes
export const TITLES = {
  'none': '',
  'captain': 'Captain',
  'corsair': 'Corsair',
  'admiral': 'Admiral',
  'commodore': 'Commodore',
  'buccaneer': 'Buccaneer',
  'pirate': 'Pirate',
  'swashbuckler': 'Swashbuckler',
  'quartermaster': 'Quartermaster'
};

// Dice skins with curated color combinations and matching glows
export const DICE_SKINS = {
  'bone': {
    name: 'Bone Classic',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-600',
    pipColor: 'text-gray-900',
    defaultHighGlow: 'emerald',
    defaultLowGlow: 'ruby'
  },
  'pearl': {
    name: 'Mystic Pearl',
    bgColor: 'bg-gradient-to-br from-slate-100 to-purple-100',
    borderColor: 'border-purple-400',
    pipColor: 'text-purple-800',
    defaultHighGlow: 'pearl',
    defaultLowGlow: 'amethyst'
  },
  'brass': {
    name: 'Pirate Brass',
    bgColor: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
    borderColor: 'border-yellow-700',
    pipColor: 'text-yellow-900',
    defaultHighGlow: 'gold',
    defaultLowGlow: 'ruby'
  },
  'ebony': {
    name: 'Shadow Ebony',
    bgColor: 'bg-gray-900',
    borderColor: 'border-gray-600',
    pipColor: 'text-gray-100',
    defaultHighGlow: 'amethyst',
    defaultLowGlow: 'sapphire'
  },
  'seaglass': {
    name: 'Ocean Glass',
    bgColor: 'bg-gradient-to-br from-cyan-300 to-teal-400',
    borderColor: 'border-teal-600',
    pipColor: 'text-teal-900',
    defaultHighGlow: 'sapphire',
    defaultLowGlow: 'emerald'
  },
  'obsidian': {
    name: 'Cursed Obsidian',
    bgColor: 'bg-gradient-to-br from-purple-900 to-gray-900',
    borderColor: 'border-purple-600',
    pipColor: 'text-purple-200',
    defaultHighGlow: 'amethyst',
    defaultLowGlow: 'pearl'
  }
};

// Pip styles
export const PIP_STYLES = {
  'dots': { name: 'Classic Dots', symbol: '•' },
  'skulls': { name: 'Skulls', symbol: '☠' },
  'anchors': { name: 'Anchors', symbol: '⚓' },
  'coins': { name: 'Coins', symbol: '◉' },
  'runes': { name: 'Runes', symbol: '◈' }
};

// Lock glow colors
export const GLOW_COLORS = {
  'emerald': 'border-4 border-emerald-400 bg-emerald-400/20',
  'gold': 'border-4 border-yellow-400 bg-yellow-400/20',
  'ruby': 'border-4 border-red-400 bg-red-400/20',
  'sapphire': 'border-4 border-blue-400 bg-blue-400/20',
  'amethyst': 'border-4 border-purple-400 bg-purple-400/20',
  'pearl': 'border-4 border-pink-400 bg-pink-400/20'
};

// Feature flags
export const ENABLE_DICE_CUSTOMIZATION = true;

// Default cosmetics
export const DEFAULT_COSMETICS: PlayerCosmetics = {
  banner: 'classic',
  emblem: 'none',
  title: 'none',
  highSkin: 'bone-classic',  // Default high-value dice collection
  lowSkin: 'pearl-simple'    // Default low-value dice collection  
};

// Import dice collections for cosmetic options
import { DICE_COLLECTIONS } from './diceCollections';

// Convert collections to cosmetic options format
const DICE_SKIN_OPTIONS = DICE_COLLECTIONS.reduce((acc, collection) => {
  acc[collection.id] = {
    name: collection.name,
    rarity: collection.rarity,
    description: collection.description
  };
  return acc;
}, {} as Record<string, any>);

// Cosmetic options for PlayerProfile component
export const cosmeticOptions = {
  banner: BANNERS,
  emblem: EMBLEMS,
  title: TITLES,
  highSkin: DICE_SKIN_OPTIONS,
  lowSkin: DICE_SKIN_OPTIONS
};