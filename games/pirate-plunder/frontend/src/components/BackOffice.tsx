import { useState } from 'react'
import { useAuth } from './AuthProvider'
import Button from './ui/Button'
import Panel from './ui/Panel'
import { DiceTuningLab } from './DiceTuningLab'
import { getBackendUrl } from '../utils/backendUrl'

const BACKEND_URL = getBackendUrl()

export default function BackOffice() {
  const { user } = useAuth()
  const [showDiceTuningLab, setShowDiceTuningLab] = useState(false)

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-emerald-900 flex items-center justify-center">
        <Panel title="🔒 Access Denied">
          <p className="text-gray-300 mb-4">This area is restricted to administrators only.</p>
          <Button onClick={() => window.location.href = '/'}>
            Return to Game
          </Button>
        </Panel>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-emerald-900 text-white p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">🔧 BackOffice</h1>
            <p className="text-gray-400">Admin Tools & Debugging</p>
          </div>
          <Button onClick={() => window.location.href = '/'} variant="secondary">
            ← Back to Game
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hand Analysis Tools */}
        <Panel title="📜 Hand Analysis">
          <div className="space-y-3">
            <Button
              onClick={() => window.open('/api/hand-history', '_blank')}
              variant="secondary"
              className="w-full"
            >
              📜 Hand History
            </Button>
            <Button
              onClick={() => {
                fetch('/api/money-flow/audit')
                  .then(res => res.json())
                  .then(data => {
                    if (data.recentHands && data.recentHands.length > 0) {
                      const mostRecentHand = data.recentHands[data.recentHands.length - 1];
                      window.open(`/api/money-flow/hand-summary/${mostRecentHand}/html`, '_blank');
                    } else {
                      alert('No recent hands found');
                    }
                  })
                  .catch(() => alert('Failed to get recent hands'));
              }}
              variant="secondary"
              className="w-full"
            >
              🎯 Latest Hand Summary
            </Button>
          </div>
        </Panel>

        {/* Money Flow Tools */}
        <Panel title="💰 Money Flow">
          <div className="space-y-3">
            <Button
              onClick={() => window.open('/api/money-flow/transactions/html', '_blank')}
              variant="secondary"
              className="w-full"
            >
              💰 Money Flow Transactions
            </Button>
            <Button
              onClick={() => window.open('/api/money-flow/audit', '_blank')}
              variant="secondary"
              className="w-full"
            >
              📊 Money Flow Audit
            </Button>
          </div>
        </Panel>

        {/* Validation Tools */}
        <Panel title="🔍 Validation">
          <div className="space-y-3">
            <Button
              onClick={() => window.open('/api/cross-reference/validate-recent/10/html', '_blank')}
              variant="secondary"
              className="w-full"
            >
              🔍 Validate Recent (10 hands)
            </Button>
            <Button
              onClick={() => {
                fetch('/api/cross-reference/current-hand')
                  .then(res => res.json())
                  .then(data => {
                    if (data.handId) {
                      const status = data.isValid ? '✅ VALID' : '❌ INVALID';
                      const discrepancies = data.discrepancies.length;
                      alert(`Current Hand: ${data.handId}\nPhase: ${data.phase}\nStatus: ${status}\nDiscrepancies: ${discrepancies}`);
                    } else {
                      alert('No active hand to validate');
                    }
                  })
                  .catch(() => alert('Failed to validate current hand'));
              }}
              variant="secondary"
              className="w-full"
            >
              🎯 Validate Current Hand
            </Button>
          </div>
        </Panel>

        {/* Dice & Cosmetics */}
        <Panel title="🎲 Dice & Cosmetics">
          <div className="space-y-3">
            <Button
              onClick={() => setShowDiceTuningLab(true)}
              variant="secondary"
              className="w-full"
            >
              🎲 Dice Tuning Lab
            </Button>
            <p className="text-sm text-gray-400 mt-2">
              Configure dice appearances, effects, and test rendering
            </p>
          </div>
        </Panel>

        {/* System Tools */}
        <Panel title="⚙️ System">
          <div className="space-y-3">
            <Button
              onClick={async () => {
                if (!confirm('⚠️ This will kick ALL players and end any current game. Are you sure?')) return;
                try {
                  const response = await fetch(`${BACKEND_URL}/api/debug/reset-table`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                  });
                  if (!response.ok) throw new Error('Failed to reset table');
                  const result = await response.json();
                  alert(result.message || 'Table reset successfully!');
                } catch (err) {
                  alert('Failed to reset table: ' + (err instanceof Error ? err.message : 'Unknown error'));
                }
              }}
              variant="warning"
              className="w-full"
            >
              🗑️ Reset Table
            </Button>
            <p className="text-sm text-gray-400 mt-2">
              ⚠️ Destructive action - kicks all players
            </p>
          </div>
        </Panel>

        {/* Server Info */}
        <Panel title="📊 Server Info">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Admin:</span>
              <span className="text-white">{user.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Backend URL:</span>
              <span className="text-white text-xs">{BACKEND_URL}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Dice Tuning Lab Modal */}
      {showDiceTuningLab && (
        <DiceTuningLab
          isOpen={showDiceTuningLab}
          onClose={() => setShowDiceTuningLab(false)}
        />
      )}
    </div>
  )
}
