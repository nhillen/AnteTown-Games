interface CardProps {
  rank?: string  // '2', '3', ..., '10', 'J', 'Q', 'K', 'A'
  suit?: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  faceDown?: boolean
  size?: 'small' | 'medium' | 'large'
}

// Map rank to file number
function getRankNumber(rank: string): string {
  const rankMap: Record<string, string> = {
    'A': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    '10': '10',
    'J': '11-JACK',
    'Q': '12-QUEEN',
    'K': '13-KING'
  }
  return rankMap[rank] || '1'
}

export function Card({ rank, suit, faceDown = false, size = 'medium' }: CardProps) {
  const sizeClasses = {
    small: 'w-16 h-24',   // Larger: was w-12 h-16
    medium: 'w-20 h-28',  // Larger: was w-16 h-22
    large: 'w-24 h-36'    // Larger: was w-20 h-28
  }

  // Show card back if faceDown or if rank/suit are missing
  if (faceDown || !rank || !suit) {
    return (
      <div className={`${sizeClasses[size]} rounded overflow-hidden shadow-lg`}>
        <img
          src="/assets/cards/card_back.svg"
          alt="Card back"
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  const suitUpper = suit.toUpperCase()
  const rankNum = getRankNumber(rank)
  const cardPath = `/assets/cards/${suitUpper.slice(0, -1)}-${rankNum}.svg`

  return (
    <div className={`${sizeClasses[size]} rounded overflow-hidden shadow-lg bg-white`}>
      <img
        src={cardPath}
        alt={`${rank} of ${suit}`}
        className="w-full h-full object-cover"
      />
    </div>
  )
}
