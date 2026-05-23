import { cn } from '@/lib/utils'

export function TopBar({ left, title, right, sub, bordered = true }) {
  return (
    <div className={cn('sticky top-0 z-10 paper-bg backdrop-blur', bordered && 'border-b border-paper-400/70')}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5 min-h-[52px]">
        <div className="w-10 -ml-2 flex items-center">{left}</div>
        <div className="flex-1 text-center">
          {title && <div className="font-serif text-[17px] text-ink leading-tight">{title}</div>}
          {sub && (
            <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">{sub}</div>
          )}
        </div>
        <div className="w-10 -mr-2 flex items-center justify-end">{right}</div>
      </div>
    </div>
  )
}
