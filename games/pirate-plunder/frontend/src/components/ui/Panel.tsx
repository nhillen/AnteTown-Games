import type { PropsWithChildren, ReactNode } from 'react'
import clsx from 'clsx'

type Props = PropsWithChildren<{
  title?: ReactNode
  className?: string
  border?: 'emerald' | 'slate'
}>

export default function Panel({ title, className, border = 'slate', children }: Props) {
  return (
    <section className={clsx('rounded-lg p-4', border === 'emerald' ? 'border border-emerald-800' : 'border border-slate-800', className)}>
      {title && <h2 className="mb-3 text-lg font-medium">{title}</h2>}
      {children}
    </section>
  )
}


