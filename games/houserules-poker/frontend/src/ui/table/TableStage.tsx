import './table.css'

interface TableStageProps {
  children?: React.ReactNode
}

export function TableStage({ children }: TableStageProps) {
  return (
    <div className="table-stage">
      <div className="table-stage__content">
        {children}
      </div>
    </div>
  )
}
