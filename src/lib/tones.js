// Mantle palette tones for Badges — composed onto shadcn <Badge variant="outline">
export const badgeTones = {
  burgundy: 'bg-burgundy/10 text-burgundy border-transparent',
  ochre: 'bg-ochre/15 text-ochre border-transparent',
  moss: 'bg-moss/15 text-moss border-transparent',
  ink: 'bg-ink/10 text-ink-2 border-transparent',
  rose: 'bg-rose/20 text-burgundy border-transparent',
}

// Mantle button overrides — composed onto shadcn <Button>
export const buttonTones = {
  // primary already = burgundy via --color-primary
  ink: 'bg-ink text-paper-50 hover:bg-ink/90',
  ochre: 'bg-ochre text-paper-50 hover:bg-ochre/90',
  paper: 'bg-paper-50 text-ink border border-paper-400 hover:bg-paper-100',
}
