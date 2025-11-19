import { useRef, useCallback } from 'react'

interface SfxOptions {
  volume?: number
  throttle?: number // Min ms between plays
}

const DEFAULT_OPTIONS: Required<SfxOptions> = {
  volume: 0.3,
  throttle: 50
}

/**
 * Hook for playing sound effects with throttling
 */
export function useSfx(soundPath: string, options: SfxOptions = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastPlayedRef = useRef<number>(0)

  const opts = { ...DEFAULT_OPTIONS, ...options }

  const play = useCallback(() => {
    const now = Date.now()
    if (now - lastPlayedRef.current < opts.throttle) {
      return // Throttled
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(soundPath)
      audioRef.current.volume = opts.volume
    }

    audioRef.current.currentTime = 0
    audioRef.current.play().catch(err => {
      console.warn('Failed to play sound:', err)
    })

    lastPlayedRef.current = now
  }, [soundPath, opts.volume, opts.throttle])

  return { play }
}

/**
 * Pre-configured poker sounds
 */
export function usePokerSfx() {
  const cardSound = useSfx('/sfx/card.ogg', { volume: 0.2, throttle: 100 })
  const chipsSound = useSfx('/sfx/chips.ogg', { volume: 0.3, throttle: 200 })

  return {
    playCard: cardSound.play,
    playChips: chipsSound.play
  }
}
