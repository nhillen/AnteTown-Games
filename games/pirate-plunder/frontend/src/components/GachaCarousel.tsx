import React, { useState, useEffect } from 'react';
import { Die } from './Dice';
import { DICE_COLLECTIONS } from '../config/diceCollections';

interface GachaCarouselProps {
  isSpinning: boolean;
  wonItem: string | null;
  onSpinComplete: () => void;
}

export const GachaCarousel: React.FC<GachaCarouselProps> = ({
  isSpinning,
  wonItem,
  onSpinComplete
}) => {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Create a shuffled array of all dice collections for the carousel
  const carouselItems = [...DICE_COLLECTIONS, ...DICE_COLLECTIONS, ...DICE_COLLECTIONS]
    .sort(() => Math.random() - 0.5); // Shuffle for variety

  useEffect(() => {
    if (isSpinning && wonItem) {
      setIsAnimating(true);

      // Find the index of the won item in our carousel
      const wonIndex = carouselItems.findIndex(item => item.id === wonItem);
      const targetPosition = wonIndex * 120; // 120px per item

      // Add some randomness to the final position
      const randomOffset = Math.random() * 50 - 25; // ±25px
      const finalPosition = targetPosition + randomOffset;

      // Animate the carousel
      const duration = 3000; // 3 seconds
      const startTime = Date.now();
      const startPosition = scrollPosition;

      // Add extra spins for effect
      const extraSpins = 2000; // 2000px of extra spinning
      const totalDistance = finalPosition + extraSpins;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentPosition = startPosition + (totalDistance * easeOut);

        setScrollPosition(currentPosition);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          onSpinComplete();
        }
      };

      requestAnimationFrame(animate);
    }
  }, [isSpinning, wonItem]);

  return (
    <div className="relative w-full h-32 overflow-hidden bg-slate-900 rounded-lg border border-slate-600">
      {/* Carousel viewport indicator */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute left-1/2 transform -translate-x-1/2 top-0 bottom-0 w-1 bg-yellow-400 opacity-75"></div>
        <div className="absolute left-1/2 transform -translate-x-1/2 w-24 h-full border-2 border-yellow-400 rounded-lg opacity-50"></div>
      </div>

      {/* Scrolling items */}
      <div
        className="flex items-center h-full transition-transform duration-100"
        style={{
          transform: `translateX(-${scrollPosition}px)`,
          transition: isAnimating ? 'none' : 'transform 0.1s ease'
        }}
      >
        {carouselItems.map((collection, index) => (
          <div
            key={`${collection.id}-${index}`}
            className="flex-shrink-0 w-28 h-24 bg-slate-700 rounded-lg border border-slate-600 mx-1 flex flex-col items-center justify-center p-2"
          >
            <div className="mb-1">
              <Die
                value={6}
                locked={false}
                preview={true}
                highSkin={collection.id}
                lowSkin={collection.id}
                size="sm"
              />
            </div>
            <div className="text-xs text-center text-white font-medium truncate w-full">
              {collection.name}
            </div>
          </div>
        ))}
      </div>

      {/* Spinning overlay */}
      {isSpinning && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="text-2xl font-bold text-yellow-400 animate-pulse">
            🎲 SPINNING...
          </div>
        </div>
      )}
    </div>
  );
};