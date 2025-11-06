/**
 * MultiTableLobby - Generic multi-table lobby component
 *
 * Platform-level component for displaying and selecting from multiple game tables.
 * Supports custom rendering for game-specific table information.
 */

import React, { useState, ReactNode } from 'react';

export type TableInfo<TConfig = any> = {
  tableId: string;
  displayName: string;
  currentPlayers: number;
  maxSeats: number;
  config?: TConfig;
  isFull?: boolean;
  isComingSoon?: boolean;
  [key: string]: any; // Allow game-specific properties
};

export type MultiTableLobbyProps<TConfig = any> = {
  /** List of available tables */
  tables: TableInfo<TConfig>[];

  /** Callback when a table is selected */
  onSelectTable: (tableId: string) => void;

  /** Currently selected table ID (optional) */
  selectedTableId?: string;

  /** Custom render function for table card content */
  renderTableCard: (table: TableInfo<TConfig>, props: {
    isSelected: boolean;
    isHovered: boolean;
    isFull: boolean;
    isComingSoon: boolean;
  }) => ReactNode;

  /** Lobby title (e.g., "🪙 CK Flipz Tables") */
  title: string;

  /** Lobby subtitle (e.g., "Choose a table to join") */
  subtitle?: string;

  /** Optional footer content (e.g., "How to Play" instructions) */
  footer?: ReactNode;

  /** Custom className for the container */
  className?: string;

  /** Grid columns configuration (default: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3") */
  gridCols?: string;
};

/**
 * Generic multi-table lobby component
 */
export function MultiTableLobby<TConfig = any>({
  tables,
  onSelectTable,
  selectedTableId,
  renderTableCard,
  title,
  subtitle,
  footer,
  className = '',
  gridCols = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
}: MultiTableLobbyProps<TConfig>) {
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);

  return (
    <div className={`h-full flex flex-col items-center justify-center p-4 ${className}`}>
      <div className="max-w-6xl w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">{title}</h1>
          {subtitle && <p className="text-gray-400">{subtitle}</p>}
        </div>

        {/* Tables Grid */}
        <div className={`grid ${gridCols} gap-4`}>
          {tables.map((table) => {
            const isSelected = selectedTableId === table.tableId;
            const isHovered = hoveredTable === table.tableId;
            const isFull = table.isFull ?? (table.currentPlayers >= table.maxSeats);
            const isComingSoon = table.isComingSoon ?? false;

            return (
              <div
                key={table.tableId}
                className={`
                  relative rounded-lg border-2 p-6 cursor-pointer transition-all
                  ${isSelected
                    ? 'border-emerald-500 bg-emerald-900/40 scale-105'
                    : isHovered
                      ? 'border-blue-400 bg-blue-900/30 scale-102'
                      : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                  }
                  ${isFull ? 'opacity-60' : ''}
                  ${isComingSoon ? 'opacity-75' : ''}
                `}
                onClick={() => !isFull && !isComingSoon && onSelectTable(table.tableId)}
                onMouseEnter={() => setHoveredTable(table.tableId)}
                onMouseLeave={() => setHoveredTable(null)}
              >
                {renderTableCard(table, { isSelected, isHovered, isFull, isComingSoon })}
              </div>
            );
          })}
        </div>

        {/* Footer (e.g., instructions) */}
        {footer && <div className="max-w-2xl mx-auto">{footer}</div>}
      </div>
    </div>
  );
}
