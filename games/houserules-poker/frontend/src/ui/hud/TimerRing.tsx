import { motion } from 'framer-motion'
import './timer.css'

interface TimerRingProps {
  timeRemaining: number // milliseconds
  totalTime: number // milliseconds
}

export function TimerRing({ timeRemaining, totalTime }: TimerRingProps) {
  const progress = timeRemaining / totalTime
  const circumference = 2 * Math.PI * 14 // radius of 14

  return (
    <div className="timer-ring">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          stroke="rgba(255,255,255,.1)"
          strokeWidth="2"
        />
        <motion.circle
          cx="16"
          cy="16"
          r="14"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%'
          }}
        />
      </svg>
      <div className="timer-ring__text">
        {Math.ceil(timeRemaining / 1000)}
      </div>
    </div>
  )
}
