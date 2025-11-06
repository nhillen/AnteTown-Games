import { useState, useEffect } from 'react'
import { ENABLE_DICE_CUSTOMIZATION } from '../config/cosmetics'
import { renderDice } from '../utils/diceRendererV2'
import { getCollection, onCacheLoad } from '../hooks/useDiceCollections'
import type { DiceConfig } from '../utils/diceRendererV2'

type DieProps = {
  value: 1 | 2 | 3 | 4 | 5 | 6
  locked?: boolean
  size?: 'sm' | 'md' | 'lg'
  highSkin?: string    // Collection ID for high rolls (4-6)
  lowSkin?: string     // Collection ID for low rolls (1-3)
  preview?: boolean    // Show effects even when unlocked (for store previews)
}

export function Die({
  value,
  locked,
  size = 'md',
  highSkin = 'bone-classic',
  lowSkin = 'pearl-simple',
  preview = false
}: DieProps) {
  // Force re-render when cache loads to get updated collections from database
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = onCacheLoad(() => {
      setTick(tick => tick + 1);
    });
    return unsubscribe;
  }, []);

  const sizeMap = {
    sm: 32,
    md: 40,
    lg: 48
  }

  const pixelSize = sizeMap[size]

  // Determine which collection to use based on die value
  const isHighRoll = value >= 4
  const collectionId = isHighRoll ? highSkin : lowSkin
  const collection = getCollection(collectionId)
  
  if (!collection) {
    // Fallback to default if collection not found
    return (
      <div 
        className="inline-block w-8 h-8 bg-slate-600 rounded flex items-center justify-center text-white text-sm"
      >
        {value}
      </div>
    )
  }

  // Convert collection to dice config for renderer
  const diceConfig: DiceConfig = {
    size: pixelSize,
    value,
    skin: collection.combo.skin as any,
    material: collection.combo.material as any,
    effects: collection.combo.effects, // Always show effects - locking just adds a ring
    tint: collection.combo.tint
  }

  // Debug effects for any dice with effects in preview mode
  if (preview && collection.combo.effects && collection.combo.effects.length > 0) {
    console.log(`${collectionId} preview debug:`, {
      collectionId,
      value,
      isHighRoll,
      preview,
      locked,
      collectionEffects: collection.combo.effects,
      finalEffects: diceConfig.effects,
      collection: collection.name
    });
  }
  
  if (!ENABLE_DICE_CUSTOMIZATION) {
    // Fallback to simple default
    diceConfig.skin = 'bone'
    diceConfig.material = 'solid'
    diceConfig.effects = locked ? [{ type: 'glow', color: '#10b981', strength: 'low' }] : []
  }
  
  const svgContent = renderDice(diceConfig)
  
  return (
    <div 
      className={`inline-block`}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}


