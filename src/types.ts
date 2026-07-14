export type MatchMode = 'doubles' | 'singles'
export type Handedness = 'right' | 'left'
export type Stroke = 'fore' | 'back'
export type Orientation = 'vertical' | 'horizontal'

export type Point = { x: number; y: number }

export type Player = Point & {
  id: string
  team: 'A' | 'B'
  label: string
  hand: Handedness
  stroke: Stroke
}
