import { useEffect } from 'react'
import { useTheme } from './ThemeProvider'

/**
 * Hook that watches for theme changes via URL params or localStorage
 * and applies them automatically
 */
export function useThemeSwitcher() {
  const { setTheme } = useTheme()

  useEffect(() => {
    // Watch for URL param changes
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const urlTheme = params.get('theme')
      if (urlTheme) {
        setTheme(urlTheme)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [setTheme])

  return { setTheme }
}
