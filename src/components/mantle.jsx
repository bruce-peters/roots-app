// Mantle-themed wrappers around shadcn primitives.
// Keeps screen code expressive (tone="burgundy") while delegating to shadcn.
import { Badge as ShadBadge } from '@/components/ui/badge'
import { Button as ShadButton } from '@/components/ui/button'
import { badgeTones, buttonTones } from '@/lib/tones'
import { cn } from '@/lib/utils'

export function MBadge({ tone = 'burgundy', className, ...props }) {
  return (
    <ShadBadge
      variant="outline"
      className={cn(
        'rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-tight',
        badgeTones[tone],
        className
      )}
      {...props}
    />
  )
}

const sizeMap = {
  sm: 'h-9 px-4 text-sm rounded-full',
  md: 'h-12 px-5 text-[15px] rounded-full',
  lg: 'h-14 px-6 text-base rounded-full',
  icon: 'h-11 w-11 rounded-full',
}

export function MButton({ tone, size = 'md', className, ...props }) {
  // tone overrides shadcn variant; default tone uses primary (burgundy)
  const variant = tone ? 'default' : 'default'
  return (
    <ShadButton
      variant={variant}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-sans font-medium tracking-tight transition active:scale-[0.98]',
        sizeMap[size],
        tone === 'ink' && buttonTones.ink,
        tone === 'ochre' && buttonTones.ochre,
        tone === 'paper' && buttonTones.paper,
        !tone &&
          'shadow-[0_1px_0_rgba(255,255,255,.12)_inset,0_8px_18px_-8px_rgba(122,46,34,.55)] hover:bg-burgundy-dark',
        className
      )}
      {...props}
    />
  )
}
