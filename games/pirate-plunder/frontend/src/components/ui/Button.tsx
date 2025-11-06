import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import clsx from 'clsx'

type ButtonProps = PropsWithChildren<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'warning'
  size?: 'sm' | 'md'
  className?: string
}> & ButtonHTMLAttributes<HTMLButtonElement>

const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:pointer-events-none'
const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base'
} as const
const variants = {
  primary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 hover:border-slate-500',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-100',
  warning: 'bg-amber-700 hover:bg-amber-600 text-white border border-amber-600 hover:border-amber-500'
} as const

export default function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
  return (
    <button className={clsx(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  )
}


