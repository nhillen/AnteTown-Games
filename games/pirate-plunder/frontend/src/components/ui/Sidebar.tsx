import { useState } from 'react'
import clsx from 'clsx'

type Props = {
  children: React.ReactNode
  title: string
  defaultOpen?: boolean
  position?: 'left' | 'right'
}

export default function Sidebar({ children, title, defaultOpen = true, position = 'left' }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={clsx(
        'fixed top-0 h-full bg-slate-800 border-slate-700 shadow-xl z-50 transition-transform duration-300',
        position === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        isOpen ? 'translate-x-0' : position === 'left' ? '-translate-x-full' : 'translate-x-full',
        'w-80'
      )}>
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-slate-700 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-60px)]">
          {children}
        </div>
      </div>
      
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'fixed top-20 z-40 bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-r shadow-lg transition-all',
          position === 'left' ? (isOpen ? 'left-80' : 'left-0') : (isOpen ? 'right-80' : 'right-0'),
          isOpen && 'rounded-l rounded-r-none'
        )}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            position === 'left' ? 
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /> :
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          ) : (
            position === 'left' ?
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /> :
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          )}
        </svg>
      </button>
    </>
  )
}