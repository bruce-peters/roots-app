import { cn } from '@/lib/utils'

export function Avatar({ person, size = 44, className }) {
  const initials = person.name.split(' ').map((w) => w[0]).join('').slice(0, 2)
  const grad = `linear-gradient(135deg, ${person.palette[0]}, ${person.palette[1]} 60%, ${person.palette[2]})`
  return (
    <div
      className={cn('relative overflow-hidden rounded-full ring-1 ring-paper-400/60', className)}
      style={{ width: size, height: size, background: grad }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center font-serif text-paper-50/95"
        style={{ fontSize: size * 0.36, letterSpacing: '-0.02em' }}
      >
        {initials}
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,.12), rgba(50,28,12,.28))',
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  )
}

export function Portrait({ person, ratio = '4/5', className }) {
  const grad = `linear-gradient(150deg, ${person.palette[0]}, ${person.palette[1]} 55%, ${person.palette[2]})`
  return (
    <div className={cn('relative overflow-hidden bg-paper-200', className)} style={{ aspectRatio: ratio }}>
      <div className="absolute inset-0" style={{ background: grad }} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(120,72,30,0.18), rgba(50,28,12,0.40))',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,.06) 0 1px, transparent 1px 2px)',
        }}
      />
      <div
        className="absolute bottom-3 left-3 font-serif italic text-paper-50/95"
        style={{ fontSize: 'min(1.4rem, 7vw)', textShadow: '0 1px 6px rgba(40,20,10,.4)' }}
      >
        {person.name.split(' ').map((w) => w[0]).join('.')}
      </div>
      <div className="absolute top-2 right-2 font-mono text-[9px] tracking-[0.12em] text-paper-50/75">
        b.{person.born}
      </div>
    </div>
  )
}
