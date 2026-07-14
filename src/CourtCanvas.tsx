import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Camera } from 'lucide-react'
import {
  COURT_HALF_L,
  DOUBLES_HALF_W,
  RACKET_LENGTH,
  SERVICE_LINE,
  SINGLES_HALF_W,
  WORLD_X,
  WORLD_Y,
  clampToWorld,
  contactPoint,
  opponentDistances,
  project,
  reachTier,
  unproject,
  zoneGeometry,
} from './geometry'
import type { MatchMode, Orientation, Player, Point } from './types'

type Props = {
  mode: MatchMode
  orientation: Orientation
  players: Player[]
  activeIds: string[]
  zoom: number
  pan: Point
  rulerPos: { x: number | null; y: number | null }
  premise: string
  onPlayersChange: (players: Player[]) => void
  onToggleActive: (id: string) => void
  onZoomChange: (zoom: number) => void
  onPanChange: (pan: Point) => void
  onRulerPosChange: (pos: { x: number | null; y: number | null }) => void
}

type DragState = {
  id: string
  pointerId: number
  startClient: Point
  moved: boolean
}

type PinchState = {
  startDist: number
  startZoom: number
}

const lineColor = '#f8fbff'

function pointsAttr(points: Point[], orientation: Orientation) {
  return points.map((point) => {
    const p = project(point, orientation)
    return `${p.x},${p.y}`
  }).join(' ')
}

function pathAttr(points: Point[], orientation: Orientation) {
  return points.map((point, index) => {
    const p = project(point, orientation)
    return `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  }).join(' ') + ' Z'
}

function firstVisit() {
  try {
    if (localStorage.getItem('sti-court-visited')) return false
    localStorage.setItem('sti-court-visited', '1')
    return true
  } catch {
    return false
  }
}

const FIRST_VISIT_HINTS = [
  '選手をタップでエリア表示／もう一度タップで解除',
  'ドラッグで自由配置／2本指でズーム・空白ドラッグでスライド',
  '右端の「設定」から陣形プリセットを呼び出せます',
]

export default function CourtCanvas({ mode, orientation, players, activeIds, zoom, pan, rulerPos, premise, onPlayersChange, onToggleActive, onZoomChange, onPanChange, onRulerPosChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<PinchState | null>(null)
  const panRef = useRef<{ pointerId: number; startClient: Point; startPan: Point } | null>(null)
  const rulerDragRef = useRef<{ axis: 'x' | 'y'; pointerId: number; startClient: Point; startCross: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [pulseSession] = useState(firstVisit)
  const [hintIndex, setHintIndex] = useState(0)

  useEffect(() => {
    // 初回訪問時のみ、操作ヒントを3枚順送りで見せる
    if (!pulseSession) return
    const timer = setInterval(() => setHintIndex((index) => (index + 1) % FIRST_VISIT_HINTS.length), 4000)
    return () => clearInterval(timer)
  }, [pulseSession])

  const zones = useMemo(() => {
    return activeIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player): player is Player => !!player)
      .map((player) => ({ player, zone: zoneGeometry(player, mode) }))
  }, [activeIds, players, mode])
  const hasZones = zones.length > 0
  const soloZone = zones.length === 1 ? zones[0].zone : null

  const horizontal = orientation === 'horizontal'
  const extentX = horizontal ? WORLD_Y : WORLD_X
  const extentY = horizontal ? WORLD_X : WORLD_Y
  const viewW = (extentX * 2) / zoom
  const viewH = (extentY * 2) / zoom
  // パンはワールド境界を越えない範囲にクランプ（ズームアウトで全体が見えている軸は固定）
  const clampPan = (p: Point): Point => {
    const limitX = Math.max(0, extentX - viewW / 2)
    const limitY = Math.max(0, extentY - viewH / 2)
    return {
      x: Math.max(-limitX, Math.min(limitX, p.x)),
      y: Math.max(-limitY, Math.min(limitY, p.y)),
    }
  }
  const panC = clampPan(pan)
  const view = {
    x: panC.x - viewW / 2,
    y: panC.y - viewH / 2,
    width: viewW,
    height: viewH,
  }

  const toWorld = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const svgPoint = {
      x: view.x + ((event.clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((event.clientY - rect.top) / rect.height) * view.height,
    }
    return clampToWorld(unproject(svgPoint, orientation))
  }

  const pinchDistance = () => {
    const points = [...pointersRef.current.values()]
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  const svgPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      // 2本指になったらドラッグ・パン・定規移動を打ち切ってピンチズームへ
      dragRef.current = null
      panRef.current = null
      rulerDragRef.current = null
      setDraggingId(null)
      pinchRef.current = { startDist: pinchDistance(), startZoom: zoom }
      return
    }
    // 選手マーカー・定規以外を掴んだらビューのスライド（各ハンドラが先に走ってrefを立てる）
    if (!dragRef.current && !rulerDragRef.current) {
      panRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startPan: panC,
      }
    }
  }

  const rulerPointerDown = (event: ReactPointerEvent<SVGRectElement>, axis: 'x' | 'y') => {
    try {
      svgRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // 合成イベント等でキャプチャできなくても操作は続行できる
    }
    rulerDragRef.current = {
      axis,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startCross: axis === 'x' ? (rulerPos.y ?? view.y + 0.5) : (rulerPos.x ?? view.x + 0.5),
    }
  }

  const markerPointerDown = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    try {
      svgRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // 合成イベント等でキャプチャできなくても操作は続行できる
    }
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      moved: false,
    }
  }

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const dist = pinchDistance()
      if (pinch.startDist > 0 && dist > 0) {
        onZoomChange(+(pinch.startZoom * (dist / pinch.startDist)).toFixed(2))
      }
      return
    }
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      const distance = Math.hypot(event.clientX - drag.startClient.x, event.clientY - drag.startClient.y)
      if (distance > 8) {
        if (!drag.moved) setDraggingId(drag.id)
        drag.moved = true
      }
      if (!drag.moved) return
      const point = toWorld(event)
      onPlayersChange(players.map((player) => player.id === drag.id ? { ...player, ...point } : player))
      return
    }
    const rulerDrag = rulerDragRef.current
    if (rulerDrag && rulerDrag.pointerId === event.pointerId) {
      const rect = svgRef.current!.getBoundingClientRect()
      if (rulerDrag.axis === 'x') {
        const next = rulerDrag.startCross + ((event.clientY - rulerDrag.startClient.y) / rect.height) * view.height
        onRulerPosChange({ ...rulerPos, y: Math.max(-extentY + 0.4, Math.min(extentY - 0.4, next)) })
      } else {
        const next = rulerDrag.startCross + ((event.clientX - rulerDrag.startClient.x) / rect.width) * view.width
        onRulerPosChange({ ...rulerPos, x: Math.max(-extentX + 0.4, Math.min(extentX - 0.4, next)) })
      }
      return
    }
    const panDrag = panRef.current
    if (panDrag && panDrag.pointerId === event.pointerId) {
      const rect = svgRef.current!.getBoundingClientRect()
      onPanChange(clampPan({
        x: panDrag.startPan.x - ((event.clientX - panDrag.startClient.x) / rect.width) * view.width,
        y: panDrag.startPan.y - ((event.clientY - panDrag.startClient.y) / rect.height) * view.height,
      }))
    }
  }

  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null
    if (rulerDragRef.current?.pointerId === event.pointerId) rulerDragRef.current = null
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved) onToggleActive(drag.id)
    setDraggingId(null)
    dragRef.current = null
  }

  const exportPng = () => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(rect.width))
    clone.setAttribute('height', String(rect.height))
    // CSSクラス由来のスタイルはシリアライズで失われるため、計算済みスタイルをインライン化する
    const styleProps = ['opacity', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-dasharray', 'paint-order', 'font-size', 'font-weight', 'font-family']
    const sources = svg.querySelectorAll<SVGElement>('*')
    const targets = clone.querySelectorAll<SVGElement>('*')
    sources.forEach((source, index) => {
      const computed = getComputedStyle(source)
      for (const prop of styleProps) {
        const value = computed.getPropertyValue(prop)
        if (value) targets[index].style.setProperty(prop, value)
      }
    })
    const xml = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const scale = 2
      const band = 64
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(rect.width * scale)
      canvas.height = Math.round(rect.height * scale) + band
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#f7fafc'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, rect.width * scale, rect.height * scale)
      ctx.fillStyle = '#0d3476'
      ctx.fillRect(0, canvas.height - band, canvas.width, band)
      ctx.fillStyle = '#ffffff'
      ctx.font = '600 22px "Noto Sans JP", sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(premise ? `前提: ${premise}` : '陣形ラボ', 20, canvas.height - band / 2)
      ctx.textAlign = 'right'
      ctx.fillText('ソフトテニスIQ｜陣形ラボ・ラケット1本分 = 0.69m', canvas.width - 20, canvas.height - band / 2)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const now = new Date()
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `court-analysis-${stamp}.png`
        link.click()
        URL.revokeObjectURL(link.href)
      }, 'image/png')
    }
    image.src = url
  }

  const P = (point: Point) => project(point, orientation)
  const courtCorners = [
    { x: -DOUBLES_HALF_W, y: -COURT_HALF_L },
    { x: DOUBLES_HALF_W, y: -COURT_HALF_L },
    { x: DOUBLES_HALF_W, y: COURT_HALF_L },
    { x: -DOUBLES_HALF_W, y: COURT_HALF_L },
  ]

  const line = (a: Point, b: Point, key: string, props: React.SVGProps<SVGLineElement> = {}) => {
    const pa = P(a)
    const pb = P(b)
    return <line key={key} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} {...props} />
  }

  const opponentRect = soloZone ? [
    { x: -WORLD_X, y: 0 },
    { x: WORLD_X, y: 0 },
    { x: WORLD_X, y: soloZone.farY },
    { x: -WORLD_X, y: soloZone.farY },
  ] : []

  return (
    <div className={`canvas-wrap canvas-${orientation}`}>
      <svg
        ref={svgRef}
        className="court-svg"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="application"
        aria-label="選手を移動して打球エリアを分析するソフトテニスコート"
        onPointerDown={svgPointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dbe4ec" strokeWidth="0.025" />
          </pattern>
          <pattern id="deadHatch" width="0.55" height="0.55" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="0.55" height="0.55" fill="#ef6f68" fillOpacity="0.14" />
            <line x1="0" y1="0" x2="0" y2="0.55" stroke="#e75850" strokeWidth="0.12" strokeOpacity="0.32" />
          </pattern>
          <filter id="markerShadow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0.12" stdDeviation="0.16" floodColor="#10234f" floodOpacity="0.28" />
          </filter>
          <filter id="markerShadowLift" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0.18" stdDeviation="0.26" floodColor="#10234f" floodOpacity="0.38" />
          </filter>
          {/* 実寸のラケット（全長0.69m）。定規と縮尺表記で使う */}
          <g id="racketIcon">
            <ellipse cx="0" cy="0.195" rx="0.125" ry="0.185" fill="none" stroke="currentColor" strokeWidth="0.055" />
            <line x1="-0.09" y1="0.14" x2="0.09" y2="0.14" stroke="currentColor" strokeWidth="0.018" opacity="0.65" />
            <line x1="-0.095" y1="0.24" x2="0.095" y2="0.24" stroke="currentColor" strokeWidth="0.018" opacity="0.65" />
            <line x1="0" y1="0.035" x2="0" y2="0.36" stroke="currentColor" strokeWidth="0.018" opacity="0.65" />
            <path d="M -0.055 0.36 L 0 0.46 L 0.055 0.36" fill="none" stroke="currentColor" strokeWidth="0.045" strokeLinejoin="round" />
            <line x1="0" y1="0.44" x2="0" y2="0.52" stroke="currentColor" strokeWidth="0.05" />
            <rect x="-0.05" y="0.51" width="0.1" height="0.16" rx="0.045" fill="currentColor" />
            <circle cx="0" cy="0.665" r="0.026" fill="currentColor" />
          </g>
          {soloZone && <clipPath id="opponentClip">
            <polygon points={pointsAttr(opponentRect, orientation)} />
          </clipPath>}
        </defs>

        <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="#f7fafc" />
        <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" />

        <polygon className={`court-face ${hasZones ? '' : 'is-idle'}`} points={pointsAttr(courtCorners, orientation)} fill="#428f91" stroke="#286d73" strokeWidth="0.08" />

        {soloZone && <g className="zone-layer">
          <path
            d={`${pathAttr(opponentRect, orientation)} ${pathAttr(soloZone.theory, orientation)}`}
            fill="url(#deadHatch)"
            fillRule="evenodd"
            clipPath="url(#opponentClip)"
          />
        </g>}
        {zones.map(({ player, zone }) => (
          <polygon key={`fill-${player.id}`} className="zone-layer" points={pointsAttr(zone.theoryFill, orientation)} fill="#22aaa1" fillOpacity="0.34" stroke="#087f82" strokeWidth="0.09" strokeOpacity="0.9" strokeLinejoin="round" />
        ))}

        <g stroke={lineColor} strokeWidth="0.075" vectorEffect="non-scaling-stroke">
          {line({ x: -DOUBLES_HALF_W, y: -COURT_HALF_L }, { x: DOUBLES_HALF_W, y: -COURT_HALF_L }, 'base-1')}
          {line({ x: -DOUBLES_HALF_W, y: COURT_HALF_L }, { x: DOUBLES_HALF_W, y: COURT_HALF_L }, 'base-2')}
          {line({ x: -DOUBLES_HALF_W, y: -COURT_HALF_L }, { x: -DOUBLES_HALF_W, y: COURT_HALF_L }, 'side-1')}
          {line({ x: DOUBLES_HALF_W, y: -COURT_HALF_L }, { x: DOUBLES_HALF_W, y: COURT_HALF_L }, 'side-2')}
          {line({ x: -SINGLES_HALF_W, y: -COURT_HALF_L }, { x: -SINGLES_HALF_W, y: COURT_HALF_L }, 'single-1', { opacity: 0.92 })}
          {line({ x: SINGLES_HALF_W, y: -COURT_HALF_L }, { x: SINGLES_HALF_W, y: COURT_HALF_L }, 'single-2', { opacity: 0.92 })}
          {line({ x: -SINGLES_HALF_W, y: -SERVICE_LINE }, { x: SINGLES_HALF_W, y: -SERVICE_LINE }, 'service-1')}
          {line({ x: -SINGLES_HALF_W, y: SERVICE_LINE }, { x: SINGLES_HALF_W, y: SERVICE_LINE }, 'service-2')}
          {line({ x: 0, y: -SERVICE_LINE }, { x: 0, y: SERVICE_LINE }, 'center-service')}
          {line({ x: -0.15, y: -COURT_HALF_L }, { x: 0.15, y: -COURT_HALF_L }, 'mark-1')}
          {line({ x: -0.15, y: COURT_HALF_L }, { x: 0.15, y: COURT_HALF_L }, 'mark-2')}
        </g>
        {line({ x: -DOUBLES_HALF_W - 0.4, y: 0 }, { x: DOUBLES_HALF_W + 0.4, y: 0 }, 'net', { stroke: '#173b52', strokeWidth: 0.16 })}

        {zones.map(({ player, zone }) => (
          <g key={`lines-${player.id}`} className="theory-lines zone-layer" fill="none" strokeLinecap="round">
            {line(zone.contact, zone.extended.left, `trajectory-left-${player.id}`, { stroke: '#087f82', strokeWidth: 0.12 })}
            {line(zone.contact, zone.extended.center, `trajectory-center-${player.id}`, { stroke: '#087f82', strokeWidth: 0.09, strokeDasharray: '0.34 0.26' })}
            {line(zone.contact, zone.extended.right, `trajectory-right-${player.id}`, { stroke: '#087f82', strokeWidth: 0.12 })}
          </g>
        ))}

        {zones.length > 0 && (() => {
          // コース名ラベル: セオリー線の意味をコート上に言語化する（パネルの用語と一致させる）
          const halfW = mode === 'doubles' ? DOUBLES_HALF_W : SINGLES_HALF_W
          const signs = [...new Set(zones.map(({ zone }) => zone.sign))]
          return <g className="course-labels zone-layer" pointerEvents="none">
            {signs.flatMap((sign) => [
              { x: -halfW, label: '左コース' },
              { x: 0, label: 'センター' },
              { x: halfW, label: '右コース' },
            ].map(({ x, label }) => {
              const p = P({ x, y: sign * (COURT_HALF_L + 0.6) })
              return <text key={`${sign}-${label}`} className="course-label" x={p.x} y={p.y + 0.18} textAnchor="middle" fontSize="0.5" fontWeight="700" fill="#087f82">{label}</text>
            }))}
          </g>
        })()}

        {zones.map(({ player }) => {
          // 測定線: 相手選手の担当2コース（自分に近い外側の線とセンター線）への最短経路と「何本分か」を描く
          const rows = opponentDistances(player, players, mode)
          return <g key={`measure-${player.id}`} className="measure-lines zone-layer" pointerEvents="none">
            {rows.flatMap((row) => {
              const opponent = players.find((p) => p.id === row.playerId)
              if (!opponent) return []
              const a = P(opponent)
              return (['outer', 'center'] as const).map((side) => {
                const measureItem = row[side]
                const b = P(measureItem.foot)
                const tier = reachTier(measureItem.distance)
                const color = tier === 'cover' ? '#0f5f63' : tier === 'stretch' ? '#0d3476' : '#e64e16'
                // ラベルは判定色のピル（白文字）。長い線は中点の垂直脇、短い線は到達点の先に置いて
                // マーカーとの重なりを避ける
                const len = Math.hypot(b.x - a.x, b.y - a.y)
                const dx = len > 0.001 ? (b.x - a.x) / len : 0
                const dy = len > 0.001 ? (b.y - a.y) / len : -1
                const short = len < 2.4
                const lx = short ? b.x + dx * 1.1 : (a.x + b.x) / 2 + -dy * 0.62
                const ly = short ? b.y + dy * 1.1 : (a.y + b.y) / 2 + dx * 0.62
                return <g key={`${player.id}-${row.playerId}-${side}`}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="0.07" strokeDasharray="0.18 0.14" />
                  <circle cx={b.x} cy={b.y} r="0.1" fill={color} />
                  <rect x={lx - 0.82} y={ly - 0.34} width="1.64" height="0.68" rx="0.34" fill={color} stroke="#fff" strokeWidth="0.05" />
                  <text x={lx} y={ly + 0.17} textAnchor="middle" fontSize="0.46" fontWeight="800" fill="#fff">
                    {`${(measureItem.distance / RACKET_LENGTH).toFixed(1)}本`}
                  </text>
                </g>
              })
            })}
          </g>
        })}

        {(['y', 'x'] as const).map((axis) => {
          // ラケット定規: 縦横両方の辺に沿って実寸のラケットを交互の濃淡で連続配置。
          // スクリーン座標の0（縦軸=ネット、横軸=センター）を0として5本ごとに数字を振る。
          // 既定はビュー端に固定。つかんで平行移動すると、置いた位置（ワールド固定）で物差しとして使える
          const R = RACKET_LENGTH
          const alongMin = axis === 'x' ? view.x : view.y
          const alongMax = axis === 'x' ? view.x + view.width : view.y + view.height
          const placed = axis === 'x' ? rulerPos.y : rulerPos.x
          const cross = placed ?? ((axis === 'x' ? view.y : view.x) + 0.5)
          const items = []
          for (let k = Math.floor(alongMin / R); k <= Math.ceil(alongMax / R); k++) {
            const s0 = k * R
            items.push(
              <use
                key={`racket-${k}`}
                href="#racketIcon"
                transform={axis === 'x' ? `translate(${s0} ${cross}) rotate(-90)` : `translate(${cross} ${s0})`}
                color="#0f5f63"
                opacity={((k % 2) + 2) % 2 === 0 ? 0.75 : 0.4}
              />,
            )
            if (k % 5 === 0) {
              items.push(
                <text
                  key={`num-${k}`}
                  className="ruler-num"
                  x={axis === 'x' ? s0 : cross + 0.4}
                  y={axis === 'x' ? cross + 0.78 : s0 + 0.16}
                  fontSize="0.44"
                  fontWeight="700"
                  fill="#3f5164"
                  textAnchor={axis === 'x' ? 'middle' : 'start'}
                >{Math.abs(k)}</text>,
              )
            }
          }
          return <g key={`ruler-${axis}`} className="racket-ruler" pointerEvents="none">
            {items}
            <rect
              className="ruler-grab"
              x={axis === 'x' ? view.x : cross - 0.55}
              y={axis === 'x' ? cross - 0.55 : view.y}
              width={axis === 'x' ? view.width : 1.1}
              height={axis === 'x' ? 1.1 : view.height}
              fill="transparent"
              pointerEvents="all"
              onPointerDown={(event) => rulerPointerDown(event, axis)}
            />
          </g>
        })}

        <g className="players">
          {players.map((player) => {
            const p = P(player)
            const isActive = activeIds.includes(player.id)
            const isDragging = player.id === draggingId
            return (
              <g
                key={player.id}
                className={`player-marker ${isActive ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(event) => markerPointerDown(event, player.id)}
                role="button"
                aria-label={`${player.label}を選択または移動`}
              >
                <circle r="1.35" fill="transparent" />
                <g className="marker-body">
                  {/* モノクロ印刷でも判別できるよう、A=丸・B=四角の形状差を付ける */}
                  {!hasZones && (player.team === 'A'
                    ? <circle className="idle-ring" r="0.72" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.05" strokeDasharray="0.12 0.14" />
                    : <rect className="idle-ring" x="-0.66" y="-0.66" width="1.32" height="1.32" rx="0.16" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.05" strokeDasharray="0.12 0.14" />)}
                  {player.team === 'A'
                    ? <circle r="0.48" fill="#123f86" stroke="#fff" strokeWidth="0.12" filter={isDragging ? 'url(#markerShadowLift)' : 'url(#markerShadow)'} />
                    : <rect x="-0.44" y="-0.44" width="0.88" height="0.88" rx="0.1" fill="#0f5f63" stroke="#fff" strokeWidth="0.12" filter={isDragging ? 'url(#markerShadowLift)' : 'url(#markerShadow)'} />}
                  {player.team === 'A'
                    ? <circle className={`select-ring ${isActive ? 'on' : ''}`} r="0.65" fill="none" stroke="#ff6a28" strokeWidth="0.13" />
                    : <rect className={`select-ring ${isActive ? 'on' : ''}`} x="-0.61" y="-0.61" width="1.22" height="1.22" rx="0.14" fill="none" stroke="#ff6a28" strokeWidth="0.13" />}
                  {pulseSession && isActive && (player.team === 'A'
                    ? <circle className="pulse-ring" r="0.65" fill="none" stroke="#ff6a28" strokeWidth="0.08" />
                    : <rect className="pulse-ring" x="-0.61" y="-0.61" width="1.22" height="1.22" rx="0.14" fill="none" stroke="#ff6a28" strokeWidth="0.08" />)}
                </g>
                <text y="1.16" textAnchor="middle" className="player-label">{isActive ? `${player.label}・打者` : player.label}</text>
              </g>
            )
          })}
        </g>

        {zones.map(({ player }) => {
          const contact = contactPoint(player)
          const playerP = P(player)
          const contactP = P(contact)
          return <g key={`contact-${player.id}`} className="contact-point" pointerEvents="none">
            <line x1={playerP.x} y1={playerP.y} x2={contactP.x} y2={contactP.y} stroke="#ff6a28" strokeWidth="0.1" strokeLinecap="round" />
            <circle cx={contactP.x} cy={contactP.y} r="0.25" fill="#fff" stroke="#ff6a28" strokeWidth="0.12" filter="url(#markerShadow)" />
            <text x={contactP.x} y={contactP.y - 0.5} textAnchor="middle" className="contact-label">打点</text>
          </g>
        })}
      </svg>
      {premise && <div className="premise-chip">前提: {premise}</div>}
      <button className="export-button" onClick={exportPng} aria-label="この配置を画像で保存" title="この配置を画像で保存">
        <Camera size={17} />
      </button>
      <div className={`canvas-hint ${hasZones ? '' : 'is-cta'}`}>
        {pulseSession
          ? FIRST_VISIT_HINTS[hintIndex]
          : hasZones
            ? 'タップで選手を追加・解除／ドラッグで自由配置／2本指でズーム'
            : '選手をタップすると、セオリー線とデッドゾーンが見える'}
      </div>
    </div>
  )
}
