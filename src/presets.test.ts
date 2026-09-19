import { describe, expect, it } from 'vitest'
import { RACKET_LENGTH } from './geometry'
import { applyFormation, applyTenkai } from './presets'
import type { Player } from './types'

const seed: Player[] = [
  { id: 'a1', team: 'A', label: 'A後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'a2', team: 'A', label: 'A前衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'front' },
  { id: 'b1', team: 'B', label: 'B後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'b2', team: 'B', label: 'B前衛', x: 0, y: 0, hand: 'left', stroke: 'back', role: 'front' },
]

describe('presets', () => {
  it('正クロスは雁行の役割とネットからの前衛距離を持つ', () => {
    const next = applyTenkai(seed, 'cross')
    const aFront = next.find((player) => player.id === 'a2')!
    const aBack = next.find((player) => player.id === 'a1')!
    expect(aFront.role).toBe('front')
    expect(aBack.role).toBe('back')
    expect(Math.abs(aFront.y)).toBeCloseTo(RACKET_LENGTH * 1.75, 5)
  })

  it('W前衛は指定チームだけ前衛役割に変える', () => {
    const crossed = applyTenkai(seed, 'cross')
    const next = applyFormation(crossed, 'A', 'wZenei')
    expect(next.find((player) => player.id === 'a1')?.role).toBe('front')
    expect(next.find((player) => player.id === 'a2')?.role).toBe('front')
    expect(next.find((player) => player.id === 'b1')?.role).toBe('back')
    expect(next.find((player) => player.id === 'b1')?.y).toBe(crossed.find((player) => player.id === 'b1')?.y)
  })
})
