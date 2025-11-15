/**
 * Deterministic RNG using Mulberry32
 *
 * This provides a seeded pseudorandom number generator for fairness and replay capability.
 * Every run uses a unique seed that can be verified client-side.
 */

/**
 * Mulberry32 - Fast, high-quality 32-bit PRNG
 * @param seed - Initial seed value
 * @returns Function that generates random numbers [0, 1)
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return function() {
    state += 0x6D2B79F5;
    let r = Math.imul(state ^ state >>> 15, 1 | state);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate a seed from multiple components
 * Simple hash function for seed generation
 */
export function generateSeed(
  serverSecret: string,
  playerId: string,
  timestamp: number,
  nonce: number
): number {
  let hash = 0;
  const input = `${serverSecret}:${playerId}:${timestamp}:${nonce}`;

  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash) >>> 0;
}

/**
 * Random number in range [min, max]
 */
export function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Random integer in range [min, max] (inclusive)
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(randomInRange(rng, min, max + 1));
}

/**
 * Random boolean with given probability
 */
export function randomBool(rng: () => number, probability: number): boolean {
  return rng() < probability;
}
