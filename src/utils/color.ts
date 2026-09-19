// Colour helpers shared by every pin that paints itself.

// A pin's colour at a pin's opacity. Kept as one function because three
// pin types had their own byte-identical copy of it, and a fourth was
// about to.
export function hexWithOpacity(hex: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100))
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
