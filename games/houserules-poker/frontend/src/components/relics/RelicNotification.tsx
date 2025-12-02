import React, { useEffect, useState } from 'react';
import type { RelicRarity } from './types';
import { getRarityColors } from './types';

/**
 * Relic event notification data
 */
export interface RelicNotificationData {
  type: 'activated' | 'revealed' | 'drafted' | 'effect';
  playerName: string;
  relicName: string;
  relicRarity: RelicRarity;
  effectDescription?: string;
  isOwnRelic?: boolean;
}

export interface RelicNotificationProps {
  /** Notification data */
  notification: RelicNotificationData;
  /** Called when notification should be dismissed */
  onDismiss: () => void;
  /** Duration in ms before auto-dismiss (0 = never) */
  duration?: number;
}

export const RelicNotification: React.FC<RelicNotificationProps> = ({
  notification,
  onDismiss,
  duration = 4000,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const colors = getRarityColors(notification.relicRarity);

  useEffect(() => {
    if (duration > 0) {
      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, duration - 300);

      const dismissTimer = setTimeout(() => {
        onDismiss();
      }, duration);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [duration, onDismiss]);

  const getIcon = () => {
    switch (notification.type) {
      case 'activated':
        return '⚡';
      case 'revealed':
        return '👁️';
      case 'drafted':
        return '🎴';
      case 'effect':
        return '✨';
    }
  };

  const getMessage = () => {
    switch (notification.type) {
      case 'activated':
        return `${notification.playerName} activated`;
      case 'revealed':
        return `${notification.playerName}'s relic revealed:`;
      case 'drafted':
        return `${notification.playerName} drafted`;
      case 'effect':
        return `${notification.playerName}'s relic triggered:`;
    }
  };

  return (
    <div
      className={`
        ${colors.bg}
        ${colors.border}
        border-2 rounded-lg
        px-4 py-3
        shadow-xl ${colors.glow}
        flex items-start gap-3
        min-w-[280px] max-w-[400px]
        ${isExiting ? 'animate-slide-out' : 'animate-slide-in'}
        ${notification.isOwnRelic ? 'ring-2 ring-yellow-400' : ''}
      `}
      onClick={onDismiss}
    >
      {/* Icon */}
      <div className="text-2xl flex-shrink-0">{getIcon()}</div>

      {/* Content */}
      <div className="flex-1">
        <div className="text-gray-400 text-xs">{getMessage()}</div>
        <div className={`${colors.text} font-bold`}>
          {notification.relicName}
        </div>
        {notification.effectDescription && (
          <div className="text-gray-300 text-sm mt-1 italic">
            {notification.effectDescription}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Notification manager that stacks multiple notifications
 */
export interface RelicNotificationManagerProps {
  /** List of active notifications */
  notifications: Array<RelicNotificationData & { id: string }>;
  /** Called when a notification should be removed */
  onDismiss: (id: string) => void;
}

export const RelicNotificationManager: React.FC<RelicNotificationManagerProps> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <RelicNotification
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
        />
      ))}
    </div>
  );
};

/**
 * Rogue Break announcement overlay
 */
export interface RogueBreakAnnouncementProps {
  /** Break number */
  breakNumber: number;
  /** Whether announcement is visible */
  isVisible: boolean;
  /** Called when animation completes */
  onComplete: () => void;
}

export const RogueBreakAnnouncement: React.FC<RogueBreakAnnouncementProps> = ({
  breakNumber,
  isVisible,
  onComplete,
}) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onComplete, 2500);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="animate-rogue-break-announce">
        <div className="bg-purple-900/95 border-4 border-purple-400 rounded-2xl px-12 py-8 shadow-2xl shadow-purple-500/50">
          <div className="text-purple-300 text-lg font-semibold tracking-wider mb-2">
            ⚡ ROGUE BREAK ⚡
          </div>
          <div className="text-5xl font-bold text-white">
            #{breakNumber}
          </div>
          <div className="text-purple-400 text-sm mt-3">
            Choose your relic wisely...
          </div>
        </div>
      </div>

      {/* Particle effects */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-purple-400 rounded-full animate-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.5}s`,
              animationDuration: `${1 + Math.random() * 1}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
