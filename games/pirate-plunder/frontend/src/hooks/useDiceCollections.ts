import { useState, useEffect } from 'react';
import { getCollectionById as getFallbackCollection, type DiceCollection } from '../config/diceCollections';

// In-memory cache for dice collections from database
let collectionsCache: Map<string, DiceCollection> | null = null;
let cachePromise: Promise<void> | null = null;
let cacheLoadListeners: Array<() => void> = [];

/**
 * Hook to load dice collections from database with fallback to flat files
 * Uses an in-memory cache to avoid repeated API calls
 */
export function useDiceCollections() {
  const [collections, setCollections] = useState<Map<string, DiceCollection> | null>(collectionsCache);
  const [loading, setLoading] = useState(!collectionsCache);

  useEffect(() => {
    // If cache exists, use it immediately
    if (collectionsCache) {
      setCollections(collectionsCache);
      setLoading(false);
      return;
    }

    // If a fetch is already in progress, wait for it
    if (cachePromise) {
      cachePromise.then(() => {
        setCollections(collectionsCache);
        setLoading(false);
      });
      return;
    }

    // Start fetching collections
    setLoading(true);
    cachePromise = fetch('/api/dice-collections')
      .then(async response => {
        if (response.ok) {
          const data = await response.json();
          collectionsCache = new Map(data.map((c: DiceCollection) => [c.id, c]));
          setCollections(collectionsCache);
        } else {
          // Fallback to empty map, will use flat file fallback in getCollection
          collectionsCache = new Map();
          setCollections(collectionsCache);
        }
      })
      .catch(error => {
        console.error('Failed to load dice collections:', error);
        // Fallback to empty map
        collectionsCache = new Map();
        setCollections(collectionsCache);
      })
      .finally(() => {
        setLoading(false);
        cachePromise = null;
        // Notify all listeners that cache has loaded
        cacheLoadListeners.forEach(listener => listener());
        cacheLoadListeners = [];
      });

    cachePromise.then(() => {
      setCollections(collectionsCache);
      setLoading(false);
    });
  }, []);

  return { collections, loading };
}

/**
 * Get a dice collection by ID from cache, with fallback to flat files
 */
export function getCollection(id: string): DiceCollection | undefined {
  // Try cache first
  if (collectionsCache?.has(id)) {
    return collectionsCache.get(id);
  }

  // Fallback to flat files
  return getFallbackCollection(id);
}

/**
 * Subscribe to cache load events
 * Returns an unsubscribe function
 */
export function onCacheLoad(callback: () => void): () => void {
  if (collectionsCache) {
    // Cache already loaded, call immediately
    callback();
    return () => {};
  }

  // Add to listeners
  cacheLoadListeners.push(callback);

  // Return unsubscribe function
  return () => {
    const index = cacheLoadListeners.indexOf(callback);
    if (index > -1) {
      cacheLoadListeners.splice(index, 1);
    }
  };
}

/**
 * Invalidate the cache (call after saving a collection)
 */
export function invalidateCollectionsCache() {
  collectionsCache = null;
  cachePromise = null;
}
