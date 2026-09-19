export type MatchMode = 'doubles' | 'singles'
export type Handedness = 'right' | 'left'
export type Stroke = 'fore' | 'back'
export type Orientation = 'vertical' | 'horizontal'
/** 前衛=ボレー圏 / 後衛=ストローク圏 / 全体=シングルスなど役割なし */
export type PlayerRole = 'front' | 'back' | 'all'

export type Point = { x: number; y: number }

export type Player = Point & {
  id: string
  team: 'A' | 'B'
  label: string
  hand: Handedness
  stroke: Stroke
  role: PlayerRole
}
