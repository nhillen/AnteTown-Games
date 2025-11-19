// React is automatically imported in Vite React projects
import { AuthProvider, useAuth } from './components/AuthProvider'
import GameApp from './components/GameApp'
import LandingPage from './components/LandingPage'
import { useDiceCollections } from './hooks/useDiceCollections'

interface AppContentProps {
  platformMode?: boolean
  tableId?: string
  socket?: any
  user?: any
}

function AppContent({ platformMode = false, tableId, socket: platformSocket, user: platformUser }: AppContentProps) {
  const { user: localUser, loading } = useAuth()
  useDiceCollections()

  // Use platform user if provided, otherwise use local
  const user = platformUser || localUser

  if (loading && !platformUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-blue-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <LandingPage />
  }

  return <GameApp platformMode={platformMode} tableId={tableId} socket={platformSocket} user={user} />
}

interface AppProps {
  platformMode?: boolean  // When true, hide platform-provided UI elements
  tableId?: string        // Table ID to join (for multi-table platform mode)
  socket?: any            // Platform socket (overrides local AuthProvider)
  user?: any              // Platform user (overrides local AuthProvider)
}

export default function App({ platformMode = false, tableId, socket, user }: AppProps = {}) {
  return (
    <AuthProvider>
      <AppContent platformMode={platformMode} tableId={tableId} socket={socket} user={user} />
    </AuthProvider>
  )
}