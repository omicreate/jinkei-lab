import { describe, expect, it } from 'vitest'
import { applyTenkai } from './presets'
import { buildShareUrl, decodeLayout, encodeLayout, parseLayoutSearch } from './layoutShare'
import type { Player } from './types'

const players: Player[] = applyTenkai([
  { id: 'a1', team: 'A', label: 'A後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'a2', team: 'A', label: 'A前衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'front' },
  { id: 'b1', team: 'B', label: 'B後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'b2', team: 'B', label: 'B前衛', x: 0, y: 0, hand: 'left', stroke: 'back', role: 'front' },
], 'cross')

describe('layoutShare', () => {
  it('往復で配置が復元できる', () => {
    const encoded = encodeLayout({
      v: 1,
      mode: 'doubles',
      players,
      activeIds: ['a1', 'b2'],
      premise: 'セカンド',
      junior: true,
    })
    const decoded = decodeLayout(encoded)
    expect(decoded?.mode).toBe('doubles')
    expect(decoded?.premise).toBe('セカンド')
    expect(decoded?.junior).toBe(true)
    expect(decoded?.activeIds).toEqual(['a1', 'b2'])
    expect(decoded?.players).toHaveLength(4)
    expect(decoded?.players.find((player) => player.id === 'a1')?.role).toBe('back')
  })

  it('共有URLに流入パラメータ src を載せない', () => {
    const url = buildShareUrl('https://example.com/jinkei-lab/?src=internal-campaign', {
      v: 1,
      mode: 'doubles',
      players,
      activeIds: ['a1'],
      premise: '',
      junior: false,
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.has('src')).toBe(false)
    expect(parsed.searchParams.has('layout')).toBe(true)
    expect(parseLayoutSearch(parsed.search)?.players).toHaveLength(4)
  })

  it('壊れたトークンや人数不足は破棄する', () => {
    expect(decodeLayout('%%%')).toBeNull()
    expect(decodeLayout(encodeLayout({
      v: 1,
      mode: 'doubles',
      players: players.slice(0, 2),
      activeIds: [],
      premise: '',
      junior: false,
    }))).toBeNull()
  })

  it('前提メモの制御文字と長文を切り捨てる', () => {
    const decoded = decodeLayout(encodeLayout({
      v: 1,
      mode: 'doubles',
      players: players.map((player) => ({ ...player, label: `${player.label}\n<script>` })),
      activeIds: ['zzz', 'a1'],
      premise: `${'あ'.repeat(40)}\n`,
      junior: false,
    }))
    expect(decoded?.premise).toHaveLength(30)
    expect(decoded?.activeIds).toEqual(['a1'])
    expect(decoded?.players[0].label.includes('<')).toBe(false)
  })
})
