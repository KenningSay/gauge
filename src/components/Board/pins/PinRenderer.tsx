import type { Pin, PortSide } from '../../../api/board'
import { PinShell, type ResizeHandle } from '../PinShell'
import { NotePin } from './NotePin'
import { ImagePin } from './ImagePin'
import { VideoPin } from './VideoPin'
import { AudioPin } from './AudioPin'
import { FilePin } from './FilePin'
import { LinkPin } from './LinkPin'
import { ShapePin } from './ShapePin'
import { FramePin } from './FramePin'
import { DrawingPin } from './DrawingPin'

interface Props {
  pin: Pin
  override?: Partial<{ x: number; y: number; w: number; h: number }>
  selected: boolean
  onPointerDownBody: (e: React.PointerEvent) => void
  onPointerDownHandle: (e: React.PointerEvent, handle: ResizeHandle) => void
  // Lit while board search is open and this pin is one of the hits.
  matched?: boolean
  onContextMenu: (e: React.MouseEvent) => void
  onPortPointerDown?: (e: React.PointerEvent, side: PortSide) => void
}

export function PinRenderer(props: Props) {
  const { pin, override, selected, matched, onPointerDownBody, onPointerDownHandle, onContextMenu, onPortPointerDown } = props
  return (
    <PinShell
      pin={pin}
      override={override}
      selected={selected}
      matched={matched}
      onPointerDownBody={onPointerDownBody}
      onPointerDownHandle={onPointerDownHandle}
      onContextMenu={onContextMenu}
      onPortPointerDown={onPortPointerDown}
    >
      {pin.type === 'note' && <NotePin pin={pin} />}
      {pin.type === 'image' && <ImagePin pin={pin} />}
      {pin.type === 'video' && <VideoPin pin={pin} />}
      {pin.type === 'audio' && <AudioPin pin={pin} />}
      {pin.type === 'file' && <FilePin pin={pin} />}
      {pin.type === 'link' && <LinkPin pin={pin} />}
      {pin.type === 'shape' && <ShapePin pin={pin} />}
      {pin.type === 'frame' && <FramePin pin={pin} />}
      {pin.type === 'drawing' && <DrawingPin pin={pin} />}
    </PinShell>
  )
}