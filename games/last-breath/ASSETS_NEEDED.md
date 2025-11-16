# Last Breath - Asset Requirements

## Door Components (High Priority)

### `door-left.png` (Recommended: 800x450px)
- **Description**: Left half of sliding airlock door
- **Visual**: Navy/charcoal metal panel with flat industrial design
- **Details**:
  - Cyan/magenta light strip along right edge (where it meets center)
  - Some stenciled text/numbers (e.g., "AIRLOCK-L", "07-B")
  - Minimal greebles, mostly flat panels
  - Should look like it belongs on a submarine/spaceship
  
### `door-right.png` (Recommended: 800x450px)
- **Description**: Right half of sliding airlock door (mirror of left)
- **Visual**: Matching navy/charcoal metal
- **Details**:
  - Cyan/magenta light strip along left edge
  - Yellow-black hazard stripes near inner edge
  - Matching industrial aesthetic

### `corridor-bg.png` (Recommended: 1600x900px)
- **Description**: Dark shaft/corridor visible when doors open
- **Visual**: Deep sea/underwater environment
- **Details**:
  - Dark blues/blacks with subtle colored glow
  - Atmospheric depth perspective
  - Can be used as background behind doors

## Event Icons (24x24px or 32x32px)

### `icon-surge.png`
- Lightning bolt or electrical surge symbol
- Color: Yellow/orange (#ffdd00)
- Style: Clean, sci-fi

### `icon-leak.png`
- Water droplet or leak symbol
- Color: Cyan (#00ddff)
- Style: Simple geometric

### `icon-canister.png`
- Air tank or oxygen canister
- Color: Light blue/cyan (#88ccff)
- Style: Recognizable silhouette

### `icon-brace.png`
- Bolt, wrench, or structural support
- Color: Steel blue (#6699cc)
- Style: Technical/industrial

### `icon-bust.png`
- Explosion, X, or skull symbol for failures
- Color: Red (#ff4444)
- Style: Clear danger indicator

### `icon-exfil.png`
- Exit arrow, money bag, or escape hatch
- Color: Gold (#ffdd00)
- Style: Positive/success indicator

## Optional Enhancements

### `door-frame.png`
- Neon cabinet frame around the entire door viewport
- Arcade-style but sci-fi themed
- Cyan/magenta accent lights

### `hazard-stripe.png`
- Yellow-black warning pattern (repeating)
- Can be tiled for borders/accents

### `depth-marker.png`
- Depth number styling/background
- Could be holographic or etched metal look

## Color Palette Reference

**Primary Colors:**
- Cyan: `#00ddff`, `#00ffff`
- Navy/Charcoal: `#1a2530`, `#0a0a0f`
- Yellow/Gold: `#ffdd00`

**Status Colors:**
- Good (O2/Suit): `#00ff88`
- Warning: `#ffaa00`
- Danger: `#ff3344`, `#ff4444`

**Event Colors:**
- Surge: `rgba(255, 200, 50, 0.5)` - Warm yellow
- Leak: `rgba(0, 200, 255, 0.5)` - Cool cyan
- Brace: `rgba(50, 255, 150, 0.4)` - Soft green
- Canister: `rgba(100, 200, 255, 0.4)` - Light blue

##File Paths (when ready)
Place assets in: `/games/last-breath/public/assets/`

Then update references in SharedRunClient.tsx from placeholder divs to:
```tsx
<img src="/assets/door-left.png" alt="Door Left" />
```
