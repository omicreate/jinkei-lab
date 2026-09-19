import { sanitizePremise, normalizeActiveIds, normalizePlayers } from './playerState'
import type { MatchMode, Player } from './types'

export const SLOTS_KEY = 'sti-court-slots'
export const JUNIOR_KEY = 'sti-court-junior'
export const SLOTS_VERSION = 1
export const SLOT_COUNT = 3

export type Slot = {
  name: string
  mode: MatchMode
  players: Player[]
  activeIds: string[]
  premise: string
} | null

export type SlotsFile = {
  v: typeof SLOTS_VERSION
  slots: Slot[]
}

function emptySlots(): Slot[] {
  return [null, null, null]
}

function normalizeSlot(raw: unknown): Slot {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const mode: MatchMode = value.mode === 'singles' ? 'singles' : 'doubles'
  const players = normalizePlayers(value.players, mode)
  if (!players) return null
  const name = String(value.name ?? '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 40)
  return {
    name: name || (mode === 'doubles' ? 'ダブルス' : 'シングルス'),
    mode,
    players,
    activeIds: normalizeActiveIds(value.activeIds, players),
    premise: sanitizePremise(value.premise),
  }
}

export function parseSlotsJson(raw: string | null): Slot[] {
  if (!raw) return emptySlots()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.length === SLOT_COUNT) {
      return parsed.map(normalizeSlot)
    }
    if (parsed && typeof parsed === 'object' && (parsed as SlotsFile).v === SLOTS_VERSION) {
      const slots = (parsed as SlotsFile).slots
      if (!Array.isArray(slots)) return emptySlots()
      const next = slots.slice(0, SLOT_COUNT).map(normalizeSlot)
      while (next.length < SLOT_COUNT) next.push(null)
      return next
    }
  } catch {
    // 破損時は空
  }
  return emptySlots()
}

export function serializeSlots(slots: Slot[]): string {
  const file: SlotsFile = { v: SLOTS_VERSION, slots: slots.slice(0, SLOT_COUNT) }
  while (file.slots.length < SLOT_COUNT) file.slots.push(null)
  return JSON.stringify(file)
}

export function loadSlots(): Slot[] {
  try {
    return parseSlotsJson(localStorage.getItem(SLOTS_KEY))
  } catch {
    return emptySlots()
  }
}

export function persistSlots(slots: Slot[]) {
  localStorage.setItem(SLOTS_KEY, serializeSlots(slots))
}

export function loadJuniorPref(): boolean {
  try {
    return localStorage.getItem(JUNIOR_KEY) === '1'
  } catch {
    return false
  }
}

export function persistJuniorPref(junior: boolean) {
  try {
    localStorage.setItem(JUNIOR_KEY, junior ? '1' : '0')
  } catch {
    // 保存できない環境でも画面上の状態は維持する
  }
}
