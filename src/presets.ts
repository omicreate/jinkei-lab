import { COURT_HALF_L, RACKET_LENGTH } from './geometry'
import type { Player, Point } from './types'

// 座標の出典（いずれも経験者監修の確定値）:
// - 左右(x)の基準 = 4展開の基準配置表
// - 深さ(ネット/ベースラインからの距離):
//     雁行陣の前衛はネットからラケット1.5〜2本分に詰めるのが通常（基準値はレンジ中央の1.75本）
//     後衛はベースラインからラケット1本分後方
//   いずれも「ここから相手・体勢・性格・風向きに合わせて随時ずらす」ニュートラル基準
// - W前衛はサービスライン前後が主戦場（ニュートラル基準配置）
//
// 出典側のコート座標系（原点=コート左上・x:0-10.97・y:0-23.77・下=自分側）から
// アプリ座標系（原点=ネット中央・Aチーム=自分側=yマイナス）への変換: x-5.485 / 11.885-y
const fromSpec = (x: number, y: number): Point => ({ x: x - 5.485, y: 11.885 - y })

const ZENEI_NET_GAP = RACKET_LENGTH * 1.75
const KOUEI_BASELINE_GAP = RACKET_LENGTH * 1.0

type TeamSign = 1 | -1
const teamSign = (team: Player['team']): TeamSign => (team === 'A' ? -1 : 1)

// 雁行陣の前衛: ネットからラケット1.75本分
const zenei = (baseX: number, team: Player['team']): Point => ({
  x: baseX - 5.485,
  y: teamSign(team) * ZENEI_NET_GAP,
})

// 後衛: ベースラインからラケット1本分後方
const kouei = (baseX: number, team: Player['team']): Point => ({
  x: baseX - 5.485,
  y: teamSign(team) * (COURT_HALF_L + KOUEI_BASELINE_GAP),
})

export type Tenkai = 'cross' | 'reverseCross' | 'straightRight' | 'straightLeft'
export type Formation = 'gankou' | 'wKouei' | 'wZenei'
export type Team = Player['team']

export const TENKAI_OPTIONS: { value: Tenkai; label: string }[] = [
  { value: 'cross', label: '正クロス' },
  { value: 'reverseCross', label: '逆クロス' },
  { value: 'straightRight', label: '右ストレート' },
  { value: 'straightLeft', label: '左ストレート' },
]

export const FORMATION_OPTIONS: { value: Formation; label: string }[] = [
  { value: 'gankou', label: '雁行陣' },
  { value: 'wKouei', label: 'W後衛' },
  { value: 'wZenei', label: 'W前衛' },
]

type PlayerPatch = { label: string; point: Point }
type TeamPatch = Record<string, PlayerPatch>

// 4展開の左右(x)は基準配置表の値、深さはラケット基準。呼称はAチーム（手前・自陣）視点
const TENKAI_PRESETS: Record<Tenkai, TeamPatch> = {
  cross: {
    a1: { label: 'A後衛', point: kouei(8.0, 'A') },
    a2: { label: 'A前衛', point: zenei(3.5, 'A') },
    b1: { label: 'B後衛', point: kouei(3.0, 'B') },
    b2: { label: 'B前衛', point: zenei(7.5, 'B') },
  },
  reverseCross: {
    a1: { label: 'A後衛', point: kouei(3.0, 'A') },
    a2: { label: 'A前衛', point: zenei(7.5, 'A') },
    b1: { label: 'B後衛', point: kouei(8.0, 'B') },
    b2: { label: 'B前衛', point: zenei(3.5, 'B') },
  },
  straightRight: {
    a1: { label: 'A後衛', point: kouei(8.5, 'A') },
    a2: { label: 'A前衛', point: zenei(6.5, 'A') },
    b1: { label: 'B後衛', point: kouei(8.5, 'B') },
    b2: { label: 'B前衛', point: zenei(6.5, 'B') },
  },
  straightLeft: {
    a1: { label: 'A後衛', point: kouei(2.5, 'A') },
    a2: { label: 'A前衛', point: zenei(4.5, 'A') },
    b1: { label: 'B後衛', point: kouei(2.5, 'B') },
    b2: { label: 'B前衛', point: zenei(4.5, 'B') },
  },
}

// チーム別陣形（雁行=クロス基準、W後衛=ダブル後衛確定値のx、W前衛=ニュートラル確定値）
const FORMATION_PRESETS: Record<Team, Record<Formation, TeamPatch>> = {
  A: {
    gankou: {
      a1: { label: 'A後衛', point: kouei(8.0, 'A') },
      a2: { label: 'A前衛', point: zenei(3.5, 'A') },
    },
    wKouei: {
      a1: { label: 'A後衛1', point: kouei(8.0, 'A') },
      a2: { label: 'A後衛2', point: kouei(3.0, 'A') },
    },
    wZenei: {
      a1: { label: 'A前衛1', point: fromSpec(7.5, 17.77) },
      a2: { label: 'A前衛2', point: fromSpec(3.5, 17.77) },
    },
  },
  B: {
    gankou: {
      b1: { label: 'B後衛', point: kouei(3.0, 'B') },
      b2: { label: 'B前衛', point: zenei(7.5, 'B') },
    },
    wKouei: {
      b1: { label: 'B後衛1', point: kouei(3.0, 'B') },
      b2: { label: 'B後衛2', point: kouei(8.0, 'B') },
    },
    wZenei: {
      b1: { label: 'B前衛1', point: fromSpec(3.5, 6.0) },
      b2: { label: 'B前衛2', point: fromSpec(7.5, 6.0) },
    },
  },
}

function patchPlayers(players: Player[], patches: TeamPatch): Player[] {
  return players.map((player) => {
    const patch = patches[player.id]
    if (!patch) return player
    return { ...player, ...patch.point, label: patch.label }
  })
}

// 展開プリセット: 両チームを雁行陣の基準配置に置き直す
export function applyTenkai(players: Player[], tenkai: Tenkai): Player[] {
  return patchPlayers(players, TENKAI_PRESETS[tenkai])
}

// 陣形プリセット: 指定チームの2人だけを置き直す（相手チームは動かさない）
export function applyFormation(players: Player[], team: Team, formation: Formation): Player[] {
  return patchPlayers(players, FORMATION_PRESETS[team][formation])
}
