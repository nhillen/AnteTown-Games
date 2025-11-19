import { useState, useEffect } from 'react'
import './action.css'

type PreAction = 'fold' | 'check' | 'check_fold'

interface ActionBarProps {
  onFold?: () => void
  onCall?: () => void
  onRaise?: (amount: number) => void
  onCheck?: () => void
  callAmount?: number
  minRaise?: number
  maxRaise?: number
  currentBet?: number
  pot?: number
  disabled?: boolean
  queuedAction?: PreAction | null
  onQueueAction?: (action: PreAction | null) => void
}

export function ActionBar({
  onFold,
  onCall,
  onRaise,
  onCheck,
  callAmount = 0,
  minRaise = 0,
  maxRaise = 10000,
  currentBet = 0,
  pot = 0,
  disabled = false,
  queuedAction = null,
  onQueueAction
}: ActionBarProps) {
  const canCheck = callAmount === 0
  const [raiseAmount, setRaiseAmount] = useState(minRaise)

  // Update raise amount when minRaise changes
  useEffect(() => {
    setRaiseAmount(minRaise)
  }, [minRaise])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (disabled) return

      switch (e.key.toLowerCase()) {
        case 'f':
          onFold?.()
          break
        case 'c':
          if (canCheck) {
            onCheck?.()
          } else {
            onCall?.()
          }
          break
        case 'r':
          if (raiseAmount >= minRaise) {
            onRaise?.(raiseAmount)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [disabled, canCheck, onFold, onCall, onCheck, onRaise, raiseAmount, minRaise])

  const handleQuickBet = (multiplier: number) => {
    let amount: number
    if (multiplier === -1) {
      // All-in
      amount = maxRaise
    } else {
      amount = Math.floor(pot * multiplier)
    }
    // Clamp to valid range
    amount = Math.max(minRaise, Math.min(maxRaise, amount))
    setRaiseAmount(amount)
  }

  // When disabled (not player's turn), show pre-action buttons
  // IMPORTANT: Keep same 3-button layout as active mode to prevent position jumping
  if (disabled && onQueueAction) {
    const willNeedToCall = callAmount > 0

    return (
      <div className="action-bar" style={{ flexDirection: 'column', gap: '12px' }}>
        {/* Keep same layout: Fold / Call-Check / Raise to prevent button jumping */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={() => onQueueAction?.(queuedAction === 'fold' ? null : 'fold')}
            className={`action-btn action-btn--fold`}
            style={{
              flex: 1,
              outline: queuedAction === 'fold' ? '3px solid #54d58b' : 'none',
              outlineOffset: '2px'
            }}
          >
            Fold
            <span className="action-btn__shortcut">F</span>
          </button>

          {willNeedToCall ? (
            <button
              onClick={() => onQueueAction?.(queuedAction === 'check_fold' ? null : 'check_fold')}
              className={`action-btn action-btn--check`}
              style={{
                flex: 1,
                outline: queuedAction === 'check_fold' ? '3px solid #54d58b' : 'none',
                outlineOffset: '2px'
              }}
            >
              Check/Fold
              <span className="action-btn__shortcut">C</span>
            </button>
          ) : (
            <button
              onClick={() => onQueueAction?.(queuedAction === 'check' ? null : 'check')}
              className={`action-btn action-btn--check`}
              style={{
                flex: 1,
                outline: queuedAction === 'check' ? '3px solid #54d58b' : 'none',
                outlineOffset: '2px'
              }}
            >
              Check
              <span className="action-btn__shortcut">C</span>
            </button>
          )}

          {/* Placeholder to maintain 3-button layout (disabled/hidden) */}
          <button
            disabled
            className="action-btn action-btn--raise"
            style={{ flex: 1, opacity: 0.3, cursor: 'not-allowed' }}
          >
            Raise (wait)
          </button>
        </div>

        <div style={{ fontSize: '11px', color: '#888', textAlign: 'center' }}>
          Pre-select action (executes on your turn)
        </div>
      </div>
    )
  }

  // Normal action bar when it's the player's turn
  return (
    <div className="action-bar" style={{ flexDirection: 'column', gap: '12px' }}>
      {/* Top row: Quick bet sizing buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          onClick={() => handleQuickBet(1/3)}
          disabled={disabled || pot === 0}
          className="action-btn action-btn--quick"
          style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
        >
          1/3 Pot
        </button>
        <button
          onClick={() => handleQuickBet(1/2)}
          disabled={disabled || pot === 0}
          className="action-btn action-btn--quick"
          style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
        >
          1/2 Pot
        </button>
        <button
          onClick={() => handleQuickBet(1)}
          disabled={disabled || pot === 0}
          className="action-btn action-btn--quick"
          style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
        >
          Pot
        </button>
        <button
          onClick={() => handleQuickBet(-1)}
          disabled={disabled}
          className="action-btn action-btn--quick"
          style={{ flex: 1, padding: '6px 12px', fontSize: '13px' }}
        >
          All-In
        </button>
      </div>

      {/* Middle row: Raise amount slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          <span style={{ fontSize: '12px', color: '#aaa' }}>Raise Amount:</span>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>
            {Math.floor(raiseAmount)} TC
          </span>
        </div>
        <input
          type="range"
          min={minRaise}
          max={maxRaise}
          step={Math.max(1, Math.floor((maxRaise - minRaise) / 100))}
          value={raiseAmount}
          onChange={(e) => setRaiseAmount(Number(e.target.value))}
          disabled={disabled || minRaise === 0}
          className="raise-slider"
          style={{
            width: '100%',
            height: '8px',
            background: disabled ? '#333' : 'linear-gradient(to right, #f59e0b, #ef4444)',
            borderRadius: '4px',
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', padding: '0 4px' }}>
          <span>Min: {Math.floor(minRaise)} TC</span>
          <span>Max: {Math.floor(maxRaise)} TC</span>
        </div>
      </div>

      {/* Bottom row: Fold / Call / Raise */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button
          onClick={onFold}
          disabled={disabled}
          className="action-btn action-btn--fold"
          style={{ flex: 1 }}
        >
          Fold
          <span className="action-btn__shortcut">F</span>
        </button>

        {canCheck ? (
          <button
            onClick={onCheck}
            disabled={disabled}
            className="action-btn action-btn--check"
            style={{ flex: 1 }}
          >
            Check
            <span className="action-btn__shortcut">C</span>
          </button>
        ) : (
          <button
            onClick={onCall}
            disabled={disabled}
            className="action-btn action-btn--call"
            style={{ flex: 1 }}
          >
            Call {Math.floor(callAmount)} TC
            <span className="action-btn__shortcut">C</span>
          </button>
        )}

        <button
          onClick={() => onRaise?.(raiseAmount)}
          disabled={disabled || !minRaise || raiseAmount < minRaise}
          className="action-btn action-btn--raise"
          style={{ flex: 1 }}
        >
          {currentBet > 0 ? 'Raise' : 'Bet'} {Math.floor(raiseAmount)} TC
          <span className="action-btn__shortcut">R</span>
        </button>
      </div>
    </div>
  )
}
