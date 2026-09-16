// Every typeface a note can be set in, served from our own origin.
//
// These used to come from fonts.googleapis.com. That is one more party
// between the user and their own board, it is slow or blocked from where
// this instance is actually used, and when it fails nothing says so — the
// text just falls back to a system default. That is why the "terminal"
// note style rendered in Courier New: IBM Plex Mono was never arriving.
//
// A long list is cheap. An @font-face rule costs only the rule until
// something on the page is actually set in that face, so the families
// nobody picks cost a few hundred bytes of CSS each rather than a
// download.
//
// Latin and cyrillic subsets are both imported wherever the family has
// them. The families that have no cyrillic are grouped as such in the
// picker, rather than quietly falling back in the middle of a word.
//
// Generated rather than typed: the available weights differ per family and
// importing one @fontsource does not ship is a build error.


// Как в приложении
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/cyrillic-400.css'
import '@fontsource/ibm-plex-sans/cyrillic-500.css'
import '@fontsource/ibm-plex-sans/cyrillic-700.css'

// Inter
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/cyrillic-400.css'
import '@fontsource/inter/cyrillic-500.css'
import '@fontsource/inter/cyrillic-700.css'

// Montserrat
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/cyrillic-400.css'
import '@fontsource/montserrat/cyrillic-500.css'
import '@fontsource/montserrat/cyrillic-700.css'

// Roboto
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import '@fontsource/roboto/cyrillic-400.css'
import '@fontsource/roboto/cyrillic-500.css'
import '@fontsource/roboto/cyrillic-700.css'

// Open Sans
import '@fontsource/open-sans/latin-400.css'
import '@fontsource/open-sans/latin-500.css'
import '@fontsource/open-sans/latin-700.css'
import '@fontsource/open-sans/cyrillic-400.css'
import '@fontsource/open-sans/cyrillic-500.css'
import '@fontsource/open-sans/cyrillic-700.css'

// PT Sans
import '@fontsource/pt-sans/latin-400.css'
import '@fontsource/pt-sans/latin-700.css'
import '@fontsource/pt-sans/cyrillic-400.css'
import '@fontsource/pt-sans/cyrillic-700.css'

// Fira Sans
import '@fontsource/fira-sans/latin-400.css'
import '@fontsource/fira-sans/latin-500.css'
import '@fontsource/fira-sans/latin-700.css'
import '@fontsource/fira-sans/cyrillic-400.css'
import '@fontsource/fira-sans/cyrillic-500.css'
import '@fontsource/fira-sans/cyrillic-700.css'

// Manrope
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/cyrillic-400.css'
import '@fontsource/manrope/cyrillic-500.css'
import '@fontsource/manrope/cyrillic-700.css'

// Nunito
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-500.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/cyrillic-400.css'
import '@fontsource/nunito/cyrillic-500.css'
import '@fontsource/nunito/cyrillic-700.css'

// Raleway
import '@fontsource/raleway/latin-400.css'
import '@fontsource/raleway/latin-500.css'
import '@fontsource/raleway/latin-700.css'
import '@fontsource/raleway/cyrillic-400.css'
import '@fontsource/raleway/cyrillic-500.css'
import '@fontsource/raleway/cyrillic-700.css'

// Rubik
import '@fontsource/rubik/latin-400.css'
import '@fontsource/rubik/latin-500.css'
import '@fontsource/rubik/latin-700.css'
import '@fontsource/rubik/cyrillic-400.css'
import '@fontsource/rubik/cyrillic-500.css'
import '@fontsource/rubik/cyrillic-700.css'

// Golos Text
import '@fontsource/golos-text/latin-400.css'
import '@fontsource/golos-text/latin-500.css'
import '@fontsource/golos-text/latin-700.css'
import '@fontsource/golos-text/cyrillic-400.css'
import '@fontsource/golos-text/cyrillic-500.css'
import '@fontsource/golos-text/cyrillic-700.css'

// Onest
import '@fontsource/onest/latin-400.css'
import '@fontsource/onest/latin-500.css'
import '@fontsource/onest/latin-700.css'
import '@fontsource/onest/cyrillic-400.css'
import '@fontsource/onest/cyrillic-500.css'
import '@fontsource/onest/cyrillic-700.css'

// Ubuntu
import '@fontsource/ubuntu/latin-400.css'
import '@fontsource/ubuntu/latin-500.css'
import '@fontsource/ubuntu/latin-700.css'
import '@fontsource/ubuntu/cyrillic-400.css'
import '@fontsource/ubuntu/cyrillic-500.css'
import '@fontsource/ubuntu/cyrillic-700.css'

// Oswald — узкий
import '@fontsource/oswald/latin-400.css'
import '@fontsource/oswald/latin-500.css'
import '@fontsource/oswald/latin-700.css'
import '@fontsource/oswald/cyrillic-400.css'
import '@fontsource/oswald/cyrillic-500.css'
import '@fontsource/oswald/cyrillic-700.css'

// Comfortaa
import '@fontsource/comfortaa/latin-400.css'
import '@fontsource/comfortaa/latin-500.css'
import '@fontsource/comfortaa/latin-700.css'
import '@fontsource/comfortaa/cyrillic-400.css'
import '@fontsource/comfortaa/cyrillic-500.css'
import '@fontsource/comfortaa/cyrillic-700.css'

// Lora
import '@fontsource/lora/latin-400.css'
import '@fontsource/lora/latin-500.css'
import '@fontsource/lora/latin-700.css'
import '@fontsource/lora/cyrillic-400.css'
import '@fontsource/lora/cyrillic-500.css'
import '@fontsource/lora/cyrillic-700.css'

// PT Serif
import '@fontsource/pt-serif/latin-400.css'
import '@fontsource/pt-serif/latin-700.css'
import '@fontsource/pt-serif/cyrillic-400.css'
import '@fontsource/pt-serif/cyrillic-700.css'

// Playfair Display
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/playfair-display/latin-500.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/playfair-display/cyrillic-400.css'
import '@fontsource/playfair-display/cyrillic-500.css'
import '@fontsource/playfair-display/cyrillic-700.css'

// Merriweather
import '@fontsource/merriweather/latin-400.css'
import '@fontsource/merriweather/latin-500.css'
import '@fontsource/merriweather/latin-700.css'
import '@fontsource/merriweather/cyrillic-400.css'
import '@fontsource/merriweather/cyrillic-500.css'
import '@fontsource/merriweather/cyrillic-700.css'

// Bitter
import '@fontsource/bitter/latin-400.css'
import '@fontsource/bitter/latin-500.css'
import '@fontsource/bitter/latin-700.css'
import '@fontsource/bitter/cyrillic-400.css'
import '@fontsource/bitter/cyrillic-500.css'
import '@fontsource/bitter/cyrillic-700.css'

// Cormorant
import '@fontsource/cormorant/latin-400.css'
import '@fontsource/cormorant/latin-500.css'
import '@fontsource/cormorant/latin-700.css'
import '@fontsource/cormorant/cyrillic-400.css'
import '@fontsource/cormorant/cyrillic-500.css'
import '@fontsource/cormorant/cyrillic-700.css'

// Alice
import '@fontsource/alice/latin-400.css'
import '@fontsource/alice/cyrillic-400.css'

// Literata
import '@fontsource/literata/latin-400.css'
import '@fontsource/literata/latin-500.css'
import '@fontsource/literata/latin-700.css'
import '@fontsource/literata/cyrillic-400.css'
import '@fontsource/literata/cyrillic-500.css'
import '@fontsource/literata/cyrillic-700.css'

// JetBrains Mono
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/cyrillic-400.css'
import '@fontsource/jetbrains-mono/cyrillic-500.css'
import '@fontsource/jetbrains-mono/cyrillic-700.css'

// IBM Plex Mono
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-700.css'
import '@fontsource/ibm-plex-mono/cyrillic-400.css'
import '@fontsource/ibm-plex-mono/cyrillic-500.css'
import '@fontsource/ibm-plex-mono/cyrillic-700.css'

// Fira Code
import '@fontsource/fira-code/latin-400.css'
import '@fontsource/fira-code/latin-500.css'
import '@fontsource/fira-code/latin-700.css'
import '@fontsource/fira-code/cyrillic-400.css'
import '@fontsource/fira-code/cyrillic-500.css'
import '@fontsource/fira-code/cyrillic-700.css'

// Source Code Pro
import '@fontsource/source-code-pro/latin-400.css'
import '@fontsource/source-code-pro/latin-500.css'
import '@fontsource/source-code-pro/latin-700.css'
import '@fontsource/source-code-pro/cyrillic-400.css'
import '@fontsource/source-code-pro/cyrillic-500.css'
import '@fontsource/source-code-pro/cyrillic-700.css'

// Roboto Mono
import '@fontsource/roboto-mono/latin-400.css'
import '@fontsource/roboto-mono/latin-500.css'
import '@fontsource/roboto-mono/latin-700.css'
import '@fontsource/roboto-mono/cyrillic-400.css'
import '@fontsource/roboto-mono/cyrillic-500.css'
import '@fontsource/roboto-mono/cyrillic-700.css'

// Ubuntu Mono
import '@fontsource/ubuntu-mono/latin-400.css'
import '@fontsource/ubuntu-mono/latin-700.css'
import '@fontsource/ubuntu-mono/cyrillic-400.css'
import '@fontsource/ubuntu-mono/cyrillic-700.css'

// Martian Mono
import '@fontsource/martian-mono/latin-400.css'
import '@fontsource/martian-mono/latin-500.css'
import '@fontsource/martian-mono/latin-700.css'
import '@fontsource/martian-mono/cyrillic-400.css'
import '@fontsource/martian-mono/cyrillic-500.css'
import '@fontsource/martian-mono/cyrillic-700.css'

// Jura
import '@fontsource/jura/latin-400.css'
import '@fontsource/jura/latin-500.css'
import '@fontsource/jura/latin-700.css'
import '@fontsource/jura/cyrillic-400.css'
import '@fontsource/jura/cyrillic-500.css'
import '@fontsource/jura/cyrillic-700.css'

// Play
import '@fontsource/play/latin-400.css'
import '@fontsource/play/latin-700.css'
import '@fontsource/play/cyrillic-400.css'
import '@fontsource/play/cyrillic-700.css'

// Exo 2
import '@fontsource/exo-2/latin-400.css'
import '@fontsource/exo-2/latin-500.css'
import '@fontsource/exo-2/latin-700.css'
import '@fontsource/exo-2/cyrillic-400.css'
import '@fontsource/exo-2/cyrillic-500.css'
import '@fontsource/exo-2/cyrillic-700.css'

// Geologica
import '@fontsource/geologica/latin-400.css'
import '@fontsource/geologica/latin-500.css'
import '@fontsource/geologica/latin-700.css'
import '@fontsource/geologica/cyrillic-400.css'
import '@fontsource/geologica/cyrillic-500.css'
import '@fontsource/geologica/cyrillic-700.css'

// Unbounded
import '@fontsource/unbounded/latin-400.css'
import '@fontsource/unbounded/latin-500.css'
import '@fontsource/unbounded/latin-700.css'
import '@fontsource/unbounded/cyrillic-400.css'
import '@fontsource/unbounded/cyrillic-500.css'
import '@fontsource/unbounded/cyrillic-700.css'

// Tektur
import '@fontsource/tektur/latin-400.css'
import '@fontsource/tektur/latin-500.css'
import '@fontsource/tektur/latin-700.css'
import '@fontsource/tektur/cyrillic-400.css'
import '@fontsource/tektur/cyrillic-500.css'
import '@fontsource/tektur/cyrillic-700.css'

// Russo One
import '@fontsource/russo-one/latin-400.css'
import '@fontsource/russo-one/cyrillic-400.css'

// Rubik Mono One
import '@fontsource/rubik-mono-one/latin-400.css'
import '@fontsource/rubik-mono-one/cyrillic-400.css'

// Pixelify Sans
import '@fontsource/pixelify-sans/latin-400.css'
import '@fontsource/pixelify-sans/latin-500.css'
import '@fontsource/pixelify-sans/latin-700.css'
import '@fontsource/pixelify-sans/cyrillic-400.css'
import '@fontsource/pixelify-sans/cyrillic-500.css'
import '@fontsource/pixelify-sans/cyrillic-700.css'

// Yeseva One
import '@fontsource/yeseva-one/latin-400.css'
import '@fontsource/yeseva-one/cyrillic-400.css'

// Caveat
import '@fontsource/caveat/latin-400.css'
import '@fontsource/caveat/latin-500.css'
import '@fontsource/caveat/latin-700.css'
import '@fontsource/caveat/cyrillic-400.css'
import '@fontsource/caveat/cyrillic-500.css'
import '@fontsource/caveat/cyrillic-700.css'

// Pacifico
import '@fontsource/pacifico/latin-400.css'
import '@fontsource/pacifico/cyrillic-400.css'

// Amatic SC
import '@fontsource/amatic-sc/latin-400.css'
import '@fontsource/amatic-sc/latin-700.css'
import '@fontsource/amatic-sc/cyrillic-400.css'
import '@fontsource/amatic-sc/cyrillic-700.css'

// Bad Script
import '@fontsource/bad-script/latin-400.css'
import '@fontsource/bad-script/cyrillic-400.css'

// Marck Script
import '@fontsource/marck-script/latin-400.css'
import '@fontsource/marck-script/cyrillic-400.css'

// Orbitron
import '@fontsource/orbitron/latin-400.css'
import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-700.css'

// Audiowide
import '@fontsource/audiowide/latin-400.css'

// Michroma
import '@fontsource/michroma/latin-400.css'

// Chakra Petch
import '@fontsource/chakra-petch/latin-400.css'
import '@fontsource/chakra-petch/latin-500.css'
import '@fontsource/chakra-petch/latin-700.css'

// Share Tech Mono
import '@fontsource/share-tech-mono/latin-400.css'

// VT323
import '@fontsource/vt323/latin-400.css'

// Silkscreen
import '@fontsource/silkscreen/latin-400.css'
import '@fontsource/silkscreen/latin-700.css'

// Press Start 2P
import '@fontsource/press-start-2p/latin-400.css'
import '@fontsource/press-start-2p/cyrillic-400.css'

// Major Mono Display
import '@fontsource/major-mono-display/latin-400.css'

// Syne Mono
import '@fontsource/syne-mono/latin-400.css'

// Monoton
import '@fontsource/monoton/latin-400.css'

// Bungee
import '@fontsource/bungee/latin-400.css'

// Righteous
import '@fontsource/righteous/latin-400.css'
