import { useEffect, useState } from 'react'

type Props = {
  startTime: number
  endTime: number
  className?: string
}

export default function ProgressBar({ startTime, endTime, className = '' }: Props) {
  const [progress, setProgress] = useState(100)
  
  useEffect(() => {
    const updateProgress = () => {
      const now = Date.now()
      const total = endTime - startTime
      const elapsed = now - startTime
      const remaining = Math.max(0, (total - elapsed) / total * 100)
      setProgress(remaining)
    }
    
    updateProgress()
    const interval = setInterval(updateProgress, 100)
    
    return () => clearInterval(interval)
  }, [startTime, endTime])
  
  return (
    <div className={`relative h-2 bg-slate-700 rounded-full overflow-hidden ${className}`}>
      <div 
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-yellow-500 transition-all duration-100 ease-linear"
        style={{ 
          width: `${progress}%`,
          background: progress > 50 ? 'linear-gradient(to right, #10b981, #eab308)' :
                     progress > 25 ? 'linear-gradient(to right, #eab308, #f97316)' :
                     'linear-gradient(to right, #f97316, #ef4444)'
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium text-white drop-shadow">
          {Math.ceil(progress / 100 * (endTime - startTime) / 1000)}s
        </span>
      </div>
    </div>
  )
}