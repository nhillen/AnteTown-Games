import { useEffect, useState } from 'react'

type Props = {
  startTime: number
  endTime: number
  className?: string
}

export default function CenterProgressBar({ startTime, endTime, className = '' }: Props) {
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
  
  const timeLeft = Math.ceil(progress / 100 * (endTime - startTime) / 1000)
  
  return (
    <div className={`relative h-3 bg-slate-700 rounded-full overflow-hidden ${className}`}>
      {/* Full background bar that shrinks from outside-in */}
      <div 
        className="absolute inset-0 transition-all duration-100 ease-linear rounded-full"
        style={{ 
          background: progress > 50 ? 'linear-gradient(to right, #10b981, #eab308)' :
                     progress > 25 ? 'linear-gradient(to right, #eab308, #f97316)' :
                     'linear-gradient(to right, #f97316, #ef4444)',
          clipPath: `inset(0 ${(100 - progress) / 2}% 0 ${(100 - progress) / 2}%)`
        }}
      />
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-white drop-shadow-md">
          {timeLeft}s
        </span>
      </div>
    </div>
  )
}