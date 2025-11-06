import type { PropsWithChildren } from 'react'
import clsx from 'clsx'

type Props = PropsWithChildren<{ 
  variant?: 'default' | 'secondary' | 'info' | 'success' | 'warning'
  className?: string
}>

export default function Badge({ variant = 'info', className, children }: Props) {
  const styles = {
    default: 'bg-slate-700 text-white',
    secondary: 'bg-indigo-600 text-white',
    info: 'bg-indigo-600 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-500 text-slate-900'
  } as const
  return (
    <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-medium', styles[variant], className)}>
      {children}
    </span>
  )
}


