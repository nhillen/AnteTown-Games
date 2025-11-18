import { ReactNode } from 'react';

type PanelProps = {
  title?: string | ReactNode;
  children: ReactNode;
  className?: string;
};

export default function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div className={`bg-slate-800 rounded-lg border border-slate-600 overflow-hidden ${className}`}>
      {title && (
        <div className="bg-slate-700 px-4 py-3 border-b border-slate-600">
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
