// Keyboard shortcut matching that survives a non-Latin layout.
//
// `event.key` is the character the layout produces: with a Russian layout
// Ctrl+Z arrives as "я", Ctrl+A as "ф", Ctrl+S as "ы". Every shortcut
// written as `e.key.toLowerCase() === 'z'` therefore silently stops working
// the moment the user switches layout — undo, select-all, save, the command
// palette, all of it.
//
// `event.code` names the physical key ("KeyZ") and is layout-independent,
// which is how editors handle this. `key` is still checked as a fallback,
// for the rare browser or remote-desktop setup that reports no useful code.

export function isKey(e: KeyboardEvent | React.KeyboardEvent, letter: string): boolean {
  const lower = letter.toLowerCase()
  return e.code === `Key${lower.toUpperCase()}` || e.key.toLowerCase() === lower
}

// True for the platform's own "command" modifier.
export function hasMod(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey
}
