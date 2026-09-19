import { describe, expect, it } from 'vitest'
import {
  RACKET_LENGTH,
  contactPoint,
  opponentDistances,
  reachTier,
  reachThresholds,
  weakestHole,
} from './geometry'
import { applyTenkai } from './presets'
import type { Player } from './types'

const doubles: Player[] = applyTenkai([
  { id: 'a1', team: 'A', label: 'A後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'a2', team: 'A', label: 'A前衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'front' },
  { id: 'b1', team: 'B', label: 'B後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'b2', team: 'B', label: 'B前衛', x: 0, y: 0, hand: 'left', stroke: 'back', role: 'front' },
], 'cross')

describe('contactPoint', () => {
  it('右利きフォアのAは打点を相手側かつフォア側へずらす', () => {
    const player = doubles.find((item) => item.id === 'a1')!
    const contact = contactPoint(player)
    expect(contact.x).toBeCloseTo(player.x + 0.5, 5)
    expect(contact.y).toBeCloseTo(player.y + 0.08, 5)
  })

  it('左利きバックのBは打点符号が打ち消し合う', () => {
    const player = doubles.find((item) => item.id === 'b2')!
    const contact = contactPoint(player)
    // hand=-1, stroke=-1, targetSign=-1 → side = (-1)*(-1)*(-1) = -1
    expect(contact.x).toBeCloseTo(player.x - 0.5, 5)
    expect(contact.y).toBeCloseTo(player.y - 0.08, 5)
  })
})

describe('opponentDistances', () => {
  it('相手チーム2人だけを測り、外側は近い方のコースを選ぶ', () => {
    const shooter = doubles.find((item) => item.id === 'a1')!
    const rows = opponentDistances(shooter, doubles, 'doubles')
    expect(rows.map((row) => row.playerId).sort()).toEqual(['b1', 'b2'])
    for (const row of rows) {
      expect(row.outer.distance).toBeLessThanOrEqual(
        Math.max(row.outer.distance, row.center.distance) + 1e-9,
      )
      expect(row.outer.side === 'left' || row.outer.side === 'right').toBe(true)
    }
  })
})

describe('reachTier', () => {
  it('後衛の閾値は2本/3本', () => {
    expect(reachThresholds({ role: 'back', junior: false })).toEqual({ cover: 2, stretch: 3 })
    expect(reachTier(RACKET_LENGTH * 2, { role: 'back', junior: false })).toBe('cover')
    expect(reachTier(RACKET_LENGTH * 2.5, { role: 'back', junior: false })).toBe('stretch')
    expect(reachTier(RACKET_LENGTH * 3.1, { role: 'back', junior: false })).toBe('open')
  })

  it('前衛とジュニアはより短い到達として判定する', () => {
    expect(reachThresholds({ role: 'front', junior: false })).toEqual({ cover: 1.5, stretch: 2.5 })
    expect(reachThresholds({ role: 'front', junior: true })).toEqual({ cover: 1, stretch: 2 })
    expect(reachTier(RACKET_LENGTH * 1.6, { role: 'front', junior: false })).toBe('stretch')
    expect(reachTier(RACKET_LENGTH * 1.6, { role: 'back', junior: false })).toBe('cover')
  })
})

describe('weakestHole', () => {
  it('最も遠い担当コースを穴として返す', () => {
    const shooter = doubles.find((item) => item.id === 'a1')!
    const hole = weakestHole(shooter, doubles, 'doubles', false)
    expect(hole).not.toBeNull()
    expect(hole!.shooterLabel).toBe('A後衛')
    expect(['B後衛', 'B前衛']).toContain(hole!.opponentLabel)
    expect(hole!.distance).toBeGreaterThan(0)
  })
})
