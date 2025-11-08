// React is automatically imported in Vite React projects
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './components/AuthProvider'
import GameApp from './components/GameApp'
import LandingPage from './components/LandingPage'
import BackOffice from './components/BackOffice'
import { useDiceCollections } from './hooks/useDiceCollections'

interface AppContentProps {
  platformMode?: boolean
}

function AppContent({ platformMode = false }: AppContentProps) {
  const { user, loading } = useAuth()
  const [view, setView] = useState<'game' | 'backoffice'>('game')
  useDiceCollections()

  // Simple client-side routing based on hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) // Remove #
      if (hash === 'backoffice') {
        setView('backoffice')
      } else {
        setView('game')
      }
    }

    handleHashChange() // Check initial hash
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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

  if (view === 'backoffice') {
    return <BackOffice />
  }

  return <GameApp platformMode={platformMode} />
}

interface AppProps {
  platformMode?: boolean  // When true, hide platform-provided UI elements
}

export default function App({ platformMode = false }: AppProps = {}) {
  return (
    <AuthProvider>
      <AppContent platformMode={platformMode} />
    </AuthProvider>
  )
}