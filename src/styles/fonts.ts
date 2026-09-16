// Every font the app can show, served from our own origin.
//
// These used to come from fonts.googleapis.com via an @import at the top of
// theme.css. That is one more party between the user and their own board,
// it is slow or blocked from where this instance is actually used, and when
// it fails nothing tells you — the text just falls back to the system
// default. That is why the "terminal" note style rendered in Courier New:
// IBM Plex Mono was never arriving.
//
// Only the weights actually used are imported, and only the latin and
// cyrillic subsets — the notes are written in Russian, so a font without
// cyrillic would fall back mid-sentence, which looks worse than not
// offering the font at all.

// UI: sans for the chrome, mono for code and the HUD note styles.
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/cyrillic-400.css'
import '@fontsource/ibm-plex-sans/cyrillic-500.css'
import '@fontsource/ibm-plex-sans/cyrillic-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/cyrillic-400.css'
import '@fontsource/ibm-plex-mono/cyrillic-500.css'

// Note fonts, offered in the note's own menu. Each one has a cyrillic
// subset, and each is different enough from the others to be worth a row.
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/cyrillic-400.css'
import '@fontsource/jetbrains-mono/cyrillic-700.css'
import '@fontsource/jura/latin-400.css'
import '@fontsource/jura/latin-700.css'
import '@fontsource/jura/cyrillic-400.css'
import '@fontsource/jura/cyrillic-700.css'
import '@fontsource/play/latin-400.css'
import '@fontsource/play/latin-700.css'
import '@fontsource/play/cyrillic-400.css'
import '@fontsource/play/cyrillic-700.css'
import '@fontsource/oswald/latin-400.css'
import '@fontsource/oswald/cyrillic-400.css'
import '@fontsource/lora/latin-400.css'
import '@fontsource/lora/cyrillic-400.css'
import '@fontsource/caveat/latin-400.css'
import '@fontsource/caveat/latin-700.css'
import '@fontsource/caveat/cyrillic-400.css'
import '@fontsource/caveat/cyrillic-700.css'
import '@fontsource/rubik/latin-400.css'
import '@fontsource/rubik/cyrillic-400.css'
