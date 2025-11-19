import React, { createContext, useContext, useEffect, useState } from 'react'
import './theme.css'
import casinoTheme from './casino.json'
import squidTheme from './squid.json'
import roguelikeTheme from './roguelike.json'

interface Theme {
  name: string
  colors: Record<string, string>
  images: Record<string, string>
  elevation: Record<string, string>
}

interface ThemeContextValue {
  theme: Theme
  themeName: string
  setTheme: (name: string) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

const THEMES: Record<string, Theme> = {
  casino: casinoTheme,
  squid: squidTheme,
  roguelike: roguelikeTheme
}

function applyTheme(theme: Theme) {
  const root = document.documentElement

  // Apply color variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value)
  })

  // Apply image variables
  Object.entries(theme.images).forEach(([key, value]) => {
    root.style.setProperty(`--img-${key}`, `url(${value})`)
  })

  // Apply elevation variables
  Object.entries(theme.elevation).forEach(([key, value]) => {
    root.style.setProperty(`--elev-${key}`, value)
  })
}

export function ThemeProvider({ children, defaultTheme = 'casino' }: {
  children: React.ReactNode
  defaultTheme?: string
}) {
  const [themeName, setThemeName] = useState<string>(() => {
    // Check URL params first
    const params = new URLSearchParams(window.location.search)
    const urlTheme = params.get('theme')
    if (urlTheme && THEMES[urlTheme]) {
      return urlTheme
    }

    // Check localStorage
    const stored = localStorage.getItem('poker-theme')
    if (stored && THEMES[stored]) {
      return stored
    }

    return defaultTheme
  })

  const theme = THEMES[themeName] || THEMES[defaultTheme]

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('poker-theme', themeName)
  }, [theme, themeName])

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme: (name: string) => {
      if (THEMES[name]) {
        setThemeName(name)
      }
    }
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
