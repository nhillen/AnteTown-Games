import './hud.css'

interface HudOverlayProps {
  children?: React.ReactNode
}

export function HudOverlay({ children }: HudOverlayProps) {
  return (
    <div className="hud-overlay">
      {children}
    </div>
  )
}
