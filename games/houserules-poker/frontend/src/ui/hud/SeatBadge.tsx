import { motion } from 'framer-motion'
import './seat.css'

interface SeatBadgeProps {
  name: string
  stack: number
  dealer?: boolean
  smallBlind?: boolean
  bigBlind?: boolean
  active?: boolean
  folded?: boolean
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function SeatBadge({ name, stack, dealer, smallBlind, bigBlind, active, folded, position = 'bottom' }: SeatBadgeProps) {
  return (
    <motion.div
      className={`seat ${active ? 'seat--active' : ''} ${folded ? 'seat--folded' : ''} seat--${position}`}
      animate={{
        y: active ? -2 : 0,
        opacity: folded ? 0.4 : 1,
        boxShadow: active ? 'var(--elev-outer)' : '0 8px 16px rgba(0,0,0,.25)'
      }}
      transition={{ type: 'tween', duration: 0.12 }}
    >
      <div className="seat__row">
        {dealer && <span className="pip">D</span>}
        {smallBlind && <span className="pip" style={{ background: '#3b82f6' }}>SB</span>}
        {bigBlind && <span className="pip" style={{ background: '#ef4444' }}>BB</span>}
        <span className="seat__name" style={{ color: folded ? '#6b7280' : undefined }}>{name}</span>
      </div>
      <div className="seat__stack" style={{ color: folded ? '#6b7280' : undefined }}>
        {stack.toFixed(0)} TC
      </div>
    </motion.div>
  )
}
