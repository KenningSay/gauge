export function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}
