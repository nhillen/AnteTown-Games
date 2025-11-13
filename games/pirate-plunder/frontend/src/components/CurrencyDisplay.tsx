/**
 * CurrencyDisplay - Reusable currency display component
 *
 * Displays currency amounts with icons and proper formatting
 */

import { getCurrencyIcon, getCurrencyColor, formatCurrency, formatCurrencyCompact, type CurrencyType } from '../utils/currency'

interface CurrencyDisplayProps {
  amount: number
  currency: CurrencyType
  compact?: boolean
  iconSize?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

const ICON_SIZES = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5'
}

export default function CurrencyDisplay({
  amount,
  currency,
  compact = false,
  iconSize = 'md',
  showLabel = false,
  className = ''
}: CurrencyDisplayProps) {
  const icon = getCurrencyIcon(currency)
  const color = getCurrencyColor(currency)
  const formatted = compact ? formatCurrencyCompact(amount) : formatCurrency(amount)

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <img src={icon} alt={currency} className={ICON_SIZES[iconSize]} />
      <span className={color}>{formatted}</span>
      {showLabel && <span className="text-gray-400 text-xs">{currency}</span>}
    </span>
  )
}
