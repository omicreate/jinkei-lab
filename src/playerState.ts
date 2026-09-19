import { clampToWorld } from './geometry'
import type { Handedness, MatchMode, Player, PlayerRole, Stroke } from './types'

const ALLOWED_IDS = new Set(['a1', 'a2', 'b1', 'b2'])

export function inferRole(label: string, mode: MatchMode): PlayerRole {
  if (mode === 'singles') return 'all'
  if (label.includes('前衛')) return 'front'
  if (label.includes('後衛')) return 'back'
  return 'all'
}

export function sanitizeLabel(value: unknown): string {
  const text = String(value ?? '').replace(/[\u0000-\u001F]/g, '').replace(/[<>]/g, '').trim()
  return text.slice(0, 16) || '選手'
}

export function sanitizePremise(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001F]/g, '').replace(/[<>]/g, '').trim().slice(0, 30)
}

function asHand(value: unknown): Handedness {
  return value === 'left' ? 'left' : 'right'
}

function asStroke(value: unknown): Stroke {
  return value === 'back' ? 'back' : 'fore'
}

function asRole(value: unknown, label: string, mode: MatchMode): PlayerRole {
  if (value === 'front' || value === 'back' || value === 'all') return value
  return inferRole(label, mode)
}

function asTeam(id: string): 'A' | 'B' {
  return id.startsWith('b') ? 'B' : 'A'
}

export function normalizePlayer(raw: unknown, mode: MatchMode): Player | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const id = String(value.id ?? '')
  if (!ALLOWED_IDS.has(id)) return null
  if (mode === 'singles' && (id === 'a2' || id === 'b2')) return null
  const label = sanitizeLabel(value.label)
  const x = Number(value.x)
  const y = Number(value.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const point = clampToWorld({ x, y })
  return {
    id,
    team: asTeam(id),
    label,
    x: point.x,
    y: point.y,
    hand: asHand(value.hand),
    stroke: asStroke(value.stroke),
    role: mode === 'singles' ? 'all' : asRole(value.role, label, mode),
  }
}

export function normalizePlayers(raw: unknown, mode: MatchMode): Player[] | null {
  if (!Array.isArray(raw)) return null
  const expected = mode === 'doubles' ? 4 : 2
  const players = raw.map((item) => normalizePlayer(item, mode)).filter((player): player is Player => !!player)
  if (players.length !== expected) return null
  const ids = new Set(players.map((player) => player.id))
  if (ids.size !== expected) return null
  if (mode === 'doubles' && !['a1', 'a2', 'b1', 'b2'].every((id) => ids.has(id))) return null
  if (mode === 'singles' && !['a1', 'b1'].every((id) => ids.has(id))) return null
  return players
}

export function normalizeActiveIds(raw: unknown, players: Player[]): string[] {
  const ids = new Set(players.map((player) => player.id))
  const list = Array.isArray(raw) ? raw.map((item) => String(item)).filter((id) => ids.has(id)) : []
  return [...new Set(list)]
}
