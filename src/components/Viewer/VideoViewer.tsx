import styles from './MediaViewer.module.css'

export function VideoViewer({ src }: { src: string }) {
  return (
    <video className={styles.video} src={src} controls autoPlay />
  )
}
