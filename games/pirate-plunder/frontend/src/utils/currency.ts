/**
 * Centralized Currency Service
 *
 * Provides consistent currency display across all games (TC, VT, event currencies)
 */

export type CurrencyType = 'TC' | 'VT' | string; // Allow event currencies

export interface CurrencyConfig {
  icon: string;        // Path to icon image
  color: string;       // Tailwind color class
  label: string;       // Display label
  name: string;        // Full name
}

/**
 * Currency configurations
 */
const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
  TC: {
    icon: '/icons/tc-icon.png',
    color: 'text-yellow-400',
    label: 'TC',
    name: 'Town Chips'
  },
  VT: {
    icon: '/icons/vt-icon.png',
    color: 'text-slate-300',
    label: 'VT',
    name: 'Village Tokens'
  }
};

/**
 * Get currency configuration
 */
export function getCurrencyConfig(currency: CurrencyType): CurrencyConfig {
  return CURRENCY_CONFIGS[currency] || CURRENCY_CONFIGS.TC;
}

/**
 * Get currency icon path
 */
export function getCurrencyIcon(currency: CurrencyType): string {
  return getCurrencyConfig(currency).icon;
}

/**
 * Get currency color class
 */
export function getCurrencyColor(currency: CurrencyType): string {
  return getCurrencyConfig(currency).color;
}

/**
 * Get currency label
 */
export function getCurrencyLabel(currency: CurrencyType): string {
  return getCurrencyConfig(currency).label;
}

/**
 * Formats currency amount
 * @param amount Amount in currency units
 * @returns Formatted string like "5,000" for 5000
 */
export function formatCurrency(amount: number): string {
  return Math.floor(amount).toLocaleString();
}

/**
 * Formats currency amount compactly
 * @param amount Amount in currency units
 * @returns Formatted string like "5k" for 5000
 */
export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1000) {
    const k = Math.floor(amount / 100) / 10;
    return `${k}k`;
  }
  return `${Math.floor(amount)}`;
}

/**
 * Legacy aliases for backwards compatibility
 */
export const formatGoldCoins = formatCurrency;
export const formatGoldCoinsCompact = formatCurrencyCompact;
