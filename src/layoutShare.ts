import { sanitizePremise, normalizeActiveIds, normalizePlayers } from './playerState'
import type { MatchMode, Player } from './types'

export const LAYOUT_PARAM = 'layout'
export const LAYOUT_VERSION = 1

export type PublicLayout = {
  v: typeof LAYOUT_VERSION
  mode: MatchMode
  players: Player[]
  activeIds: string[]
  premise: string
  junior: boolean
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
    const binary = atob(padded)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

export function encodeLayout(layout: PublicLayout): string {
  const body = JSON.stringify({
    v: LAYOUT_VERSION,
    mode: layout.mode,
    players: layout.players.map((player) => ({
      id: player.id,
      label: player.label,
      x: +player.x.toFixed(3),
      y: +player.y.toFixed(3),
      hand: player.hand,
      stroke: player.stroke,
      role: player.role,
    })),
    activeIds: layout.activeIds,
    premise: layout.premise,
    junior: layout.junior,
  })
  return bytesToBase64Url(new TextEncoder().encode(body))
}

export function decodeLayout(token: string): PublicLayout | null {
  const bytes = base64UrlToBytes(token)
  if (!bytes) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (parsed.v !== LAYOUT_VERSION) return null
    const mode: MatchMode = parsed.mode === 'singles' ? 'singles' : 'doubles'
    const players = normalizePlayers(parsed.players, mode)
    if (!players) return null
    return {
      v: LAYOUT_VERSION,
      mode,
      players,
      activeIds: normalizeActiveIds(parsed.activeIds, players),
      premise: sanitizePremise(parsed.premise),
      junior: parsed.junior === true,
    }
  } catch {
    return null
  }
}

/** 公開URL用。流入計測の src など、配置と無関係なクエリは付けない */
export function parseLayoutSearch(search: string): PublicLayout | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const token = params.get(LAYOUT_PARAM)
  if (!token) return null
  return decodeLayout(token)
}

export function buildShareUrl(baseUrl: string, layout: PublicLayout): string {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set(LAYOUT_PARAM, encodeLayout(layout))
  return url.toString()
}
