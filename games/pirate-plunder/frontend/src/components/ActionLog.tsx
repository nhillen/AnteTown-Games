import { useEffect, useRef } from 'react'
import Badge from './ui/Badge'

type LogEntry = {
  id: string
  timestamp: number
  playerName: string
  action: string
  details?: string
  isAI: boolean
}

type Props = {
  entries: LogEntry[]
  className?: string
}

export default function ActionLog({ entries, className = '' }: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [entries])
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      minute: '2-digit',
      second: '2-digit'
    })
  }
  
  const getActionColor = (action: string) => {
    if (action.includes('Cargo Chest')) {
      if (action.includes('Won')) return 'text-purple-300'
      if (action.includes('+')) return 'text-purple-400'
    }
    
    switch (action.toLowerCase()) {
      case 'bet':
      case 'raise':
        return 'text-yellow-400'
      case 'call':
        return 'text-green-400'
      case 'fold':
        return 'text-red-400'
      case 'check':
        return 'text-blue-400'
      case 'lock':
        return 'text-purple-400'
      default:
        return 'text-slate-300'
    }
  }
  
  return (
    <div className={`bg-slate-900/50 rounded-lg border border-slate-700 ${className}`}>
      <div className="px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">Action Log</h3>
      </div>
      <div 
        ref={logRef}
        className="h-32 overflow-y-auto p-2 space-y-1 text-xs"
      >
        {entries.length === 0 ? (
          <div className="text-slate-500 text-center py-4">
            No actions yet
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 p-1 rounded hover:bg-slate-800/50"
            >
              <span className="text-slate-500 w-12 flex-shrink-0">
                {formatTime(entry.timestamp)}
              </span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-slate-300 truncate">
                  {entry.playerName}
                </span>
                {entry.isAI && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0">
                    AI
                  </Badge>
                )}
              </div>
              <span className={`font-medium ${getActionColor(entry.action)}`}>
                {entry.action}
              </span>
              {entry.details && (
                <span className="text-slate-400 truncate">
                  {entry.details}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}