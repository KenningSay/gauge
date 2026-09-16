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

// `default` has no class of its own — it means "inherit the app's font".
export const FONT_CLASS: Record<NoteFont, string> = {
  default: '',
  mono: styles.fontMono,
  tech: styles.fontTech,
  techno: styles.fontTechno,
  condensed: styles.fontCondensed,
  serif: styles.fontSerif,
  hand: styles.fontHand,
  round: styles.fontRound,
}

// What the font menu offers, in the order it offers it. The css variable
// is there so each row can be set in the font it names.
export const NOTE_FONTS: Array<{ id: NoteFont; label: string; css: string }> = [
  { id: 'default', label: 'Как в приложении', css: 'var(--font-sans)' },
  { id: 'mono', label: 'Моноширинный', css: 'var(--font-note-mono)' },
  { id: 'tech', label: 'Техно', css: 'var(--font-note-tech)' },
  { id: 'techno', label: 'Игровой', css: 'var(--font-note-techno)' },
  { id: 'condensed', label: 'Узкий', css: 'var(--font-note-condensed)' },
  { id: 'serif', label: 'С засечками', css: 'var(--font-note-serif)' },
  { id: 'hand', label: 'Рукописный', css: 'var(--font-note-hand)' },
  { id: 'round', label: 'Округлый', css: 'var(--font-note-round)' },
]

// Black or white text over a given background, by relative luminance.
// Straight WCAG, with the threshold nudged up a little: at 0.5 the mid
// yellows came out white-on-yellow, which is the case that started this.
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45 ? '#16150f' : '#f4f3ef'
}
