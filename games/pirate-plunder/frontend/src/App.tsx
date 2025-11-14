// React is automatically imported in Vite React projects
import { AuthProvider, useAuth } from './components/AuthProvider'
import GameApp from './components/GameApp'
import LandingPage from './components/LandingPage'
import { useDiceCollections } from './hooks/useDiceCollections'

interface AppContentProps {
  platformMode?: boolean
  tableId?: string
}

function AppContent({ platformMode = false, tableId }: AppContentProps) {
  const { user, loading } = useAuth()
  useDiceCollections()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-blue-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <LandingPage />
  }

  return <GameApp platformMode={platformMode} tableId={tableId} />
}

interface AppProps {
  platformMode?: boolean  // When true, hide platform-provided UI elements
  tableId?: string        // Table ID to join (for multi-table platform mode)
}

export default function App({ platformMode = false, tableId }: AppProps = {}) {
  return (
    <AuthProvider>
      <AppContent platformMode={platformMode} tableId={tableId} />
    </AuthProvider>
  )
}