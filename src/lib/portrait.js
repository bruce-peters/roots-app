const PALETTES = [
  ['#9A4234', '#C28A7C', '#E2C9A5'],
  ['#5E6B3A', '#8C9156', '#C7C9A0'],
  ['#B07A2C', '#D4A35A', '#EBD8B5'],
  ['#3F5A6B', '#7E96A4', '#C9D4DA'],
  ['#6B3F5A', '#A47E96', '#D4C9D6'],
  ['#7A2E22', '#B07A6C', '#E0CDB8'],
  ['#3A5E4F', '#779083', '#C0D2C8'],
  ['#8C5A2C', '#C6936A', '#E8D3B8'],
]

const ACCENTS = ['#7A2E22', '#5E6B3A', '#B07A2C', '#3F5A6B', '#6B3F5A', '#8C5A2C']

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function paletteFor(id) {
  return PALETTES[hashStr(String(id)) % PALETTES.length]
}

export function accentFor(id) {
  return ACCENTS[hashStr(String(id)) % ACCENTS.length]
}
