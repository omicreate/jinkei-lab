import { describe, expect, it } from 'vitest'
import { applyTenkai } from './presets'
import { parseSlotsJson, serializeSlots } from './slots'
import type { Player } from './types'

const players: Player[] = applyTenkai([
  { id: 'a1', team: 'A', label: 'A後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'a2', team: 'A', label: 'A前衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'front' },
  { id: 'b1', team: 'B', label: 'B後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'b2', team: 'B', label: 'B前衛', x: 0, y: 0, hand: 'left', stroke: 'back', role: 'front' },
], 'cross')

describe('slots', () => {
  it('旧形式の配列3枠を読み、役割をラベルから補完する', () => {
    const legacy = JSON.stringify([
      {
        name: '旧データ',
        mode: 'doubles',
        players: players.map(({ role: _role, ...rest }) => rest),
        activeIds: ['a1'],
        premise: 'メモ',
      },
      null,
      null,
    ])
    const slots = parseSlotsJson(legacy)
    expect(slots[0]?.name).toBe('旧データ')
    expect(slots[0]?.players.find((player) => player.id === 'a2')?.role).toBe('front')
    expect(slots[1]).toBeNull()
  })

  it('v1 形式を往復できる', () => {
    const json = serializeSlots([
      { name: '保存1', mode: 'doubles', players, activeIds: ['a1'], premise: '前提' },
      null,
      null,
    ])
    expect(JSON.parse(json).v).toBe(1)
    const slots = parseSlotsJson(json)
    expect(slots[0]?.players).toHaveLength(4)
    expect(slots[0]?.premise).toBe('前提')
  })

  it('破損JSONは空3枠にする', () => {
    expect(parseSlotsJson('{')).toEqual([null, null, null])
  })
})
