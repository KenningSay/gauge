// The tables that say how a note style is drawn, in one place.
//
// These used to exist twice — once in NotePin and once in the template
// panel — which meant the panel's previews silently drifted out of step
// with the board every time a style was added. They also used to live in
// NotePin.tsx, a component module, which broke React Fast Refresh for the
// whole file: every edit to a note reloaded the page instead of the
// component. A plain module fixes both.

import type { NoteFont, NoteStyle } from '../../../api/board'
import styles from './Pins.module.css'

export const STYLE_CLASS: Record<NoteStyle, string> = {
  sticky: styles.styleSticky,
  paper: styles.stylePaper,
  torn: styles.styleTorn,
  lined: styles.styleLined,
  spiral: styles.styleSpiral,
  spiralSide: styles.styleSpiralSide,
  clip: styles.styleClip,
  clipboard: styles.styleClipboard,
  tape: styles.styleTape,
  tapeCorners: styles.styleTapeCorners,
  card: styles.styleCard,
  folder: styles.styleFolder,
  ribbon: styles.styleRibbon,
  banner: styles.styleBanner,
  numbered: styles.styleNumbered,
  doubleFrame: styles.styleDoubleFrame,
  dashed: styles.styleDashed,
  bolted: styles.styleBolted,
  bubble: styles.styleBubble,
  tag: styles.styleTag,
  capsule: styles.styleCapsule,
  hud: styles.styleHud,
  hudBracket: styles.styleHudBracket,
  terminal: styles.styleTerminal,
  hazard: styles.styleHazard,
  scan: styles.styleScan,
  dither: styles.styleDither,
  barcode: styles.styleBarcode,
  chip: styles.styleChip,
  vrFrame: styles.styleVrFrame,
  vrPanel: styles.styleVrPanel,
  callout: styles.styleCallout,
  roundFrame: styles.styleRoundFrame,
  hexFrame: styles.styleHexFrame,
  stripeBar: styles.styleStripeBar,
  labelBar: styles.styleLabelBar,
  waveform: styles.styleWaveform,
  arrowTab: styles.styleArrowTab,
  pixelWindow: styles.stylePixelWindow,
  screwPlate: styles.styleScrewPlate,
  meter: styles.styleMeter,
  octagon: styles.styleOctagon,
  stencil: styles.styleStencil,
}

// The styles that take the note's colour as an accent and paint their own
// dark plate, rather than using it as the background.
export const HUD_STYLES = new Set<NoteStyle>([
  'hud',
  'hudBracket',
  'terminal',
  'hazard',
  'scan',
  'dither',
  'barcode',
  'chip',
  'vrFrame',
  'vrPanel',
  'callout',
  'roundFrame',
  'hexFrame',
  'stripeBar',
  'labelBar',
  'waveform',
  'arrowTab',
  'pixelWindow',
  'screwPlate',
  'meter',
  'octagon',
  'stencil',
])

export const hudClass = styles.hudBase
export const hudPlateClass = styles.hudPlate

// The size a note's text is set at before anyone changes it. It is here
// rather than read off the stylesheet because two different places have to
// agree with the CSS about it — the size box in the formatting bar, and
// the scale applied to the small script faces. They were hardcoded as 16
// and 15, and a sweep that changed the stylesheet left both of them lying.
export const BASE_NOTE_FONT_SIZE = 16

// Every typeface the note menu offers, with the css to set it in and the
// group it is listed under. `scale` is for the faces drawn much smaller or
// larger than their nominal size — a script face at 16px reads as a
// footnote next to a grotesque at 16px — and applies only until the note
// is given an explicit size of its own.
//
// Applied as an inline font-family rather than as a class per face: fifty
// nearly identical CSS rules is not a stylesheet, it is a table written in
// the wrong language.
export interface NoteFontDef {
  id: NoteFont
  label: string
  css: string
  group: string
  scale?: number
}

export const NOTE_FONTS: NoteFontDef[] = [
  { id: 'default', label: 'Как в приложении', css: "'IBM Plex Sans', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'inter', label: 'Inter', css: "'Inter', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'montserrat', label: 'Montserrat', css: "'Montserrat', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'roboto', label: 'Roboto', css: "'Roboto', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'openSans', label: 'Open Sans', css: "'Open Sans', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'ptSans', label: 'PT Sans', css: "'PT Sans', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'firaSans', label: 'Fira Sans', css: "'Fira Sans', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'manrope', label: 'Manrope', css: "'Manrope', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'nunito', label: 'Nunito', css: "'Nunito', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'raleway', label: 'Raleway', css: "'Raleway', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'round', label: 'Rubik', css: "'Rubik', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'golos', label: 'Golos Text', css: "'Golos Text', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'onest', label: 'Onest', css: "'Onest', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'ubuntu', label: 'Ubuntu', css: "'Ubuntu', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'condensed', label: 'Oswald — узкий', css: "'Oswald', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'comfortaa', label: 'Comfortaa', css: "'Comfortaa', system-ui, sans-serif", group: 'Без засечек' },
  { id: 'serif', label: 'Lora', css: "'Lora', Georgia, serif", group: 'С засечками' },
  { id: 'ptSerif', label: 'PT Serif', css: "'PT Serif', Georgia, serif", group: 'С засечками' },
  { id: 'playfair', label: 'Playfair Display', css: "'Playfair Display', Georgia, serif", group: 'С засечками' },
  { id: 'merriweather', label: 'Merriweather', css: "'Merriweather', Georgia, serif", group: 'С засечками' },
  { id: 'bitter', label: 'Bitter', css: "'Bitter', Georgia, serif", group: 'С засечками' },
  { id: 'cormorant', label: 'Cormorant', css: "'Cormorant', Georgia, serif", group: 'С засечками', scale: 1.15 },
  { id: 'alice', label: 'Alice', css: "'Alice', Georgia, serif", group: 'С засечками' },
  { id: 'literata', label: 'Literata', css: "'Literata', Georgia, serif", group: 'С засечками' },
  { id: 'mono', label: 'JetBrains Mono', css: "'JetBrains Mono', ui-monospace, monospace", group: 'Моноширинные' },
  { id: 'plexMono', label: 'IBM Plex Mono', css: "'IBM Plex Mono', ui-monospace, monospace", group: 'Моноширинные' },
  { id: 'firaCode', label: 'Fira Code', css: "'Fira Code', ui-monospace, monospace", group: 'Моноширинные' },
  { id: 'sourceCode', label: 'Source Code Pro', css: "'Source Code Pro', ui-monospace, monospace", group: 'Моноширинные' },
  { id: 'robotoMono', label: 'Roboto Mono', css: "'Roboto Mono', ui-monospace, monospace", group: 'Моноширинные' },
  { id: 'ubuntuMono', label: 'Ubuntu Mono', css: "'Ubuntu Mono', ui-monospace, monospace", group: 'Моноширинные', scale: 1.1 },
  { id: 'martianMono', label: 'Martian Mono', css: "'Martian Mono', ui-monospace, monospace", group: 'Моноширинные' },
  { id: 'tech', label: 'Jura', css: "'Jura', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'techno', label: 'Play', css: "'Play', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'exo2', label: 'Exo 2', css: "'Exo 2', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'geologica', label: 'Geologica', css: "'Geologica', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'unbounded', label: 'Unbounded', css: "'Unbounded', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'tektur', label: 'Tektur', css: "'Tektur', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'russoOne', label: 'Russo One', css: "'Russo One', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'rubikMono', label: 'Rubik Mono One', css: "'Rubik Mono One', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'pixelify', label: 'Pixelify Sans', css: "'Pixelify Sans', system-ui, sans-serif", group: 'Акцидентные', scale: 1.1 },
  { id: 'yeseva', label: 'Yeseva One', css: "'Yeseva One', system-ui, sans-serif", group: 'Акцидентные' },
  { id: 'hand', label: 'Caveat', css: "'Caveat', cursive", group: 'Рукописные', scale: 1.4 },
  { id: 'pacifico', label: 'Pacifico', css: "'Pacifico', cursive", group: 'Рукописные', scale: 1.1 },
  { id: 'amatic', label: 'Amatic SC', css: "'Amatic SC', cursive", group: 'Рукописные', scale: 1.5 },
  { id: 'badScript', label: 'Bad Script', css: "'Bad Script', cursive", group: 'Рукописные', scale: 1.25 },
  { id: 'marck', label: 'Marck Script', css: "'Marck Script', cursive", group: 'Рукописные', scale: 1.3 },
  { id: 'orbitron', label: 'Orbitron', css: "'Orbitron', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'audiowide', label: 'Audiowide', css: "'Audiowide', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'michroma', label: 'Michroma', css: "'Michroma', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'chakra', label: 'Chakra Petch', css: "'Chakra Petch', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'shareTech', label: 'Share Tech Mono', css: "'Share Tech Mono', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'vt323', label: 'VT323', css: "'VT323', system-ui, sans-serif", group: 'Только латиница', scale: 1.35 },
  { id: 'silkscreen', label: 'Silkscreen', css: "'Silkscreen', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'pressStart', label: 'Press Start 2P', css: "'Press Start 2P', system-ui, sans-serif", group: 'Только латиница', scale: 0.8 },
  { id: 'majorMono', label: 'Major Mono Display', css: "'Major Mono Display', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'syneMono', label: 'Syne Mono', css: "'Syne Mono', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'monoton', label: 'Monoton', css: "'Monoton', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'bungee', label: 'Bungee', css: "'Bungee', system-ui, sans-serif", group: 'Только латиница' },
  { id: 'righteous', label: 'Righteous', css: "'Righteous', system-ui, sans-serif", group: 'Только латиница' },
]

export const FONT_BY_ID = new Map(NOTE_FONTS.map((f) => [f.id, f]))

// The order the groups are listed in, which is deliberate: the ones most
// likely to be wanted first, the latin-only ones last so the label is read
// before anything is picked.
export const FONT_GROUPS = [
  'Без засечек',
  'С засечками',
  'Моноширинные',
  'Акцидентные',
  'Рукописные',
  'Только латиница',
]

// Black or white text over a given background, by relative luminance.
// Straight WCAG, with the threshold nudged up a little: at 0.5 the mid
// yellows came out white-on-yellow, which is the case that started this.
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45 ? '#16150f' : '#f4f3ef'
}
