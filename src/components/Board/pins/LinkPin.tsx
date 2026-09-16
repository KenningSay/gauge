import { ExternalLink } from 'lucide-react'
import type { LinkPin as LinkPinT } from '../../../api/board'
import { faviconFor } from '../../../utils/boardPinFactories'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

export function LinkPin({ pin }: { pin: LinkPinT }) {
  const { activated } = usePinActivation()
  const favicon = pin.favicon || faviconFor(pin.url)
  let domain = ''
  try {
    domain = new URL(pin.url).hostname.replace(/^www\./, '')
  } catch {
    domain = pin.url
  }

  return (
    <div className={styles.linkWrap}>
      {/* The iframe is always rendered (so its load begins immediately),
          but visually hidden until activated. A site that refuses to be
          framed will just show blank — the fallback card is always
          underneath and becomes visible if the iframe fails silently. */}
      {activated && (
        <iframe
          className={styles.linkIframe}
          src={pin.url}
          title={pin.title || domain}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}

      {!activated && (
        <div className={styles.linkFallback}>
          {favicon && <img className={styles.linkFavicon} src={favicon} alt="" />}
          <div className={styles.linkDomain}>{domain}</div>
          {pin.title && <div className={styles.linkTitle}>{pin.title}</div>}
        </div>
      )}

      <a
        className={styles.linkOpenBtn}
        href={pin.url}
        target="_blank"
        rel="noopener noreferrer"
        title="Открыть в новой вкладке"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={14} />
      </a>
    </div>
  )
}