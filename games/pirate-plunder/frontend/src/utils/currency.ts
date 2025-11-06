/**
 * Formats pennies as gold coins (1 penny = 1 gold coin)
 * @param pennies Amount in pennies (base unit)
 * @returns Formatted string like "5,000⚜" for 5000 pennies
 */
export function formatGoldCoins(pennies: number): string {
  return `${pennies.toLocaleString()}⚜`;
}

/**
 * Formats pennies as gold coins compactly (1 penny = 1 gold coin)
 * @param pennies Amount in pennies (base unit)  
 * @returns Formatted string like "5k⚜" for 5000 pennies
 */
export function formatGoldCoinsCompact(pennies: number): string {
  if (pennies >= 1000) {
    const k = Math.floor(pennies / 100) / 10;
    return `${k}k⚜`;
  }
  return `${pennies}⚜`;
}