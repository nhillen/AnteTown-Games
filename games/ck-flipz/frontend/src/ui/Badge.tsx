import { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info';
  className?: string;
};

export default function Badge({ children, variant = 'info', className = '' }: BadgeProps) {
  const variantStyles = {
    success: 'bg-emerald-600 text-white',
    warning: 'bg-yellow-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-blue-600 text-white'
  };

  return (
    <span
      className={`inline-block px-2 py-1 text-xs font-semibold rounded ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
