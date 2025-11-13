/**
 * BuyInModal - Shared buy-in modal component for Pirate Plunder
 *
 * Provides consistent buy-in experience with validation and balance checking
 */

import { useState, useEffect } from 'react'
import Button from './ui/Button'
import { getCurrencyIcon, getCurrencyColor, type CurrencyType } from '../utils/currency'

interface BuyInModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (amount: number) => void
  minBuyIn: number
  maxBuyIn: number
  userBalance: number
  currency: CurrencyType
  initialAmount?: number
  title?: string
}

export default function BuyInModal({
  isOpen,
  onClose,
  onConfirm,
  minBuyIn,
  maxBuyIn,
  userBalance,
  currency,
  initialAmount,
  title = 'Choose Buy-in Amount'
}: BuyInModalProps) {
  const [buyInAmount, setBuyInAmount] = useState(initialAmount || minBuyIn)

  // Reset amount when modal opens
  useEffect(() => {
    if (isOpen) {
      setBuyInAmount(initialAmount || minBuyIn)
    }
  }, [isOpen, initialAmount, minBuyIn])

  if (!isOpen) return null

  const hasEnoughBalance = userBalance >= buyInAmount
  const isValidAmount = buyInAmount >= minBuyIn && buyInAmount <= maxBuyIn

  // Currency styling from centralized service
  const currencyColor = getCurrencyColor(currency)
  const currencyIcon = getCurrencyIcon(currency)

  const formatCurrency = (amount: number) => amount.toFixed(0)

  const handleAmountChange = (value: string) => {
    const amount = parseInt(value) || minBuyIn
    // Clamp between min and max
    setBuyInAmount(Math.min(maxBuyIn, Math.max(minBuyIn, amount)))
  }

  const handleConfirm = () => {
    if (hasEnoughBalance && isValidAmount) {
      onConfirm(buyInAmount)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-96 border border-slate-600">
        <h2 className="text-xl font-bold mb-4 text-white">💰 {title}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2 flex items-center gap-1">
              Buy-in Amount (minimum
              <img src={currencyIcon} alt={currency} className="w-3 h-3 inline" />
              <span className={currencyColor}>{formatCurrency(minBuyIn)}</span>)
            </label>
            <input
              type="number"
              min={minBuyIn}
              max={maxBuyIn}
              step={100}
              value={buyInAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className={`w-full bg-slate-700 rounded px-3 py-2 text-white ${
                !isValidAmount ? 'border-2 border-red-500' : 'border border-slate-600'
              }`}
              autoFocus
            />
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <img src={currencyIcon} alt={currency} className="w-4 h-4" />
              <span className={currencyColor}>{formatCurrency(buyInAmount)}</span>
            </p>

            {/* Validation messages */}
            {!isValidAmount && (
              <p className="text-xs text-red-400 mt-1">
                ⚠️ Amount must be between {formatCurrency(minBuyIn)} and {formatCurrency(maxBuyIn)} {currency}
              </p>
            )}

            {/* Balance display and warning */}
            <div className="mt-3 p-2 bg-slate-700/50 rounded">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                Your Balance:
                <img src={currencyIcon} alt={currency} className="w-3 h-3" />
                <span className={currencyColor}>{formatCurrency(userBalance)}</span>
              </p>
              {!hasEnoughBalance && (
                <p className="text-xs text-red-400 mt-1">
                  ⚠️ Insufficient balance! Need {formatCurrency(buyInAmount - userBalance)} more {currency}.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              className={`flex items-center gap-2 ${!hasEnoughBalance || !isValidAmount ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!hasEnoughBalance || !isValidAmount}
            >
              Sit Down with
              <img src={currencyIcon} alt={currency} className="w-4 h-4 inline" />
              <span className={currencyColor}>{formatCurrency(buyInAmount)}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
