import type { MatchMode, Orientation, Player, Point } from './types'

export const COURT_LENGTH = 23.77
export const DOUBLES_WIDTH = 10.97
export const SINGLES_WIDTH = 8.23
export const COURT_HALF_L = COURT_LENGTH / 2
export const DOUBLES_HALF_W = DOUBLES_WIDTH / 2
export const SINGLES_HALF_W = SINGLES_WIDTH / 2
export const SERVICE_LINE = 6.4
export const OUTCOURT_SIDE = 3
export const OUTCOURT_BASE = 4
export const WORLD_X = DOUBLES_HALF_W + OUTCOURT_SIDE
export const WORLD_Y = COURT_HALF_L + OUTCOURT_BASE

export function targetSign(player: Player) {
  return player.team === 'A' ? 1 : -1
}

export function contactPoint(player: Player): Point {
  const hand = player.hand === 'right' ? 1 : -1
  const stroke = player.stroke === 'fore' ? 1 : -1
  const side = hand * stroke * targetSign(player)
  return {
    x: player.x + side * 0.5,
    y: player.y + targetSign(player) * 0.08,
  }
}

export function targetPoints(player: Player, mode: MatchMode) {
  const sign = targetSign(player)
  const halfWidth = mode === 'doubles' ? DOUBLES_HALF_W : SINGLES_HALF_W
  return {
    left: { x: -halfWidth, y: sign * COURT_HALF_L },
    center: { x: 0, y: sign * COURT_HALF_L },
    right: { x: halfWidth, y: sign * COURT_HALF_L },
  }
}

export function xOnLineAtY(from: Point, through: Point, y: number) {
  const dy = through.y - from.y
  if (Math.abs(dy) < 0.0001) return through.x
  return from.x + ((y - from.y) / dy) * (through.x - from.x)
}

export function zoneGeometry(player: Player, mode: MatchMode) {
  const contact = contactPoint(player)
  const targets = targetPoints(player, mode)
  const sign = targetSign(player)
  const farY = sign * WORLD_Y
  const baseY = sign * COURT_HALF_L

  const netXs = [
    xOnLineAtY(contact, targets.left, 0),
    xOnLineAtY(contact, targets.right, 0),
  ].sort((a, b) => a - b)
  const farXs = [
    xOnLineAtY(contact, targets.left, farY),
    xOnLineAtY(contact, targets.right, farY),
  ].sort((a, b) => a - b)
  const baseXs = [targets.left.x, targets.right.x].sort((a, b) => a - b)

  return {
    contact,
    targets,
    sign,
    farY,
    theory: [
      { x: netXs[0], y: 0 },
      { x: netXs[1], y: 0 },
      { x: farXs[1], y: farY },
      { x: farXs[0], y: farY },
    ],
    // 有効な返球範囲の塗りはベースラインで止める（線はコート外まで延長したまま）
    theoryFill: [
      { x: netXs[0], y: 0 },
      { x: netXs[1], y: 0 },
      { x: baseXs[1], y: baseY },
      { x: baseXs[0], y: baseY },
    ],
    extended: {
      left: { x: xOnLineAtY(contact, targets.left, farY), y: farY },
      center: { x: xOnLineAtY(contact, targets.center, farY), y: farY },
      right: { x: xOnLineAtY(contact, targets.right, farY), y: farY },
    },
  }
}

export function project(point: Point, orientation: Orientation): Point {
  return orientation === 'vertical'
    ? { x: point.x, y: -point.y }
    : { x: point.y, y: point.x }
}

export function unproject(point: Point, orientation: Orientation): Point {
  return orientation === 'vertical'
    ? { x: point.x, y: -point.y }
    : { x: point.y, y: point.x }
}

export function clampToWorld(point: Point): Point {
  return {
    x: Math.max(-WORLD_X, Math.min(WORLD_X, point.x)),
    y: Math.max(-WORLD_Y, Math.min(WORLD_Y, point.y)),
  }
}

function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (!l2) return a
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / l2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

// ソフトテニスラケットの長さ。大人も子供も共通の物差しとして距離換算に使う
export const RACKET_LENGTH = 0.69

// 到達判定: 〜2本=カバー圏内（基本）/ 〜3本=踏み込みで届く（攻めの位置取り）/ 3本超=リーチ外
export type ReachTier = 'cover' | 'stretch' | 'open'

export function reachTier(distance: number): ReachTier {
  const rackets = distance / RACKET_LENGTH
  if (rackets <= 2) return 'cover'
  if (rackets <= 3) return 'stretch'
  return 'open'
}

export type CourseMeasure = {
  distance: number
  // セオリー線上の到達点（コート上に測定線を描くために使う）
  foot: Point
}

export type OpponentDistance = {
  playerId: string
  label: string
  // その選手が現実に守るべき2コース: 自分に近い側の外側セオリー線とセンター線。
  // 遠い側の外コースはペアの担当なので測定対象外
  outer: CourseMeasure & { side: 'left' | 'right' }
  center: CourseMeasure
}

export function opponentDistances(active: Player, players: Player[], mode: MatchMode): OpponentDistance[] {
  const zone = zoneGeometry(active, mode)
  const measure = (player: Player, end: Point): CourseMeasure => {
    const foot = closestPointOnSegment(player, zone.contact, end)
    return { distance: Math.hypot(player.x - foot.x, player.y - foot.y), foot }
  }
  return players
    .filter((player) => player.team !== active.team)
    .map((player) => {
      const left = measure(player, zone.extended.left)
      const right = measure(player, zone.extended.right)
      const outer = left.distance <= right.distance
        ? { ...left, side: 'left' as const }
        : { ...right, side: 'right' as const }
      return {
        playerId: player.id,
        label: player.label,
        outer,
        center: measure(player, zone.extended.center),
      }
    })
}
