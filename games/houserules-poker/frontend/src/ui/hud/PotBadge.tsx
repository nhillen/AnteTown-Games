import { motion, useAnimate } from 'framer-motion'
import { useEffect } from 'react'
import './pot.css'

interface PotBadgeProps {
  amount: number
}

export function PotBadge({ amount }: PotBadgeProps) {
  const [scope, animate] = useAnimate()

  useEffect(() => {
    if (amount > 0) {
      // Pulse animation when pot changes
      animate(scope.current, { scale: [1, 1.06, 1] }, { duration: 0.12 })
    }
  }, [amount, animate, scope])

  return (
    <motion.div
      ref={scope}
      className="pot-badge"
    >
      <div className="pot-badge__label">Pot</div>
      <div className="pot-badge__amount">{amount.toFixed(0)} TC</div>
    </motion.div>
  )
}
