import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, RotateCw, Settings, ZoomIn, ZoomOut } from 'lucide-react'
import CourtCanvas from './CourtCanvas'
import { RACKET_LENGTH, opponentDistances, reachThresholds, reachTier, weakestHole } from './geometry'
import { buildShareUrl, parseLayoutSearch } from './layoutShare'
import { FORMATION_OPTIONS, TENKAI_OPTIONS, applyFormation, applyTenkai } from './presets'
import type { Formation, Team, Tenkai } from './presets'
import { loadJuniorPref, loadSlots, persistJuniorPref, persistSlots } from './slots'
import type { Slot } from './slots'
import type { Handedness, MatchMode, Player, PlayerRole, Orientation, Stroke } from './types'

const doublesSeed: Player[] = applyTenkai([
  { id: 'a1', team: 'A', label: 'A後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'a2', team: 'A', label: 'A前衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'front' },
  { id: 'b1', team: 'B', label: 'B後衛', x: 0, y: 0, hand: 'right', stroke: 'fore', role: 'back' },
  { id: 'b2', team: 'B', label: 'B前衛', x: 0, y: 0, hand: 'left', stroke: 'back', role: 'front' },
], 'cross')

const singlesSeed: Player[] = [
  { id: 'a1', team: 'A', label: 'A', x: 1.2, y: -8.8, hand: 'right', stroke: 'fore', role: 'all' },
  { id: 'b1', team: 'B', label: 'B', x: -1.2, y: 8.8, hand: 'left', stroke: 'back', role: 'all' },
]

const TIER_LABEL = {
  cover: 'カバー圏内',
  stretch: '踏み込みで届く',
  open: 'リーチ外',
} as const

const publicLayout = typeof window === 'undefined' ? null : parseLayoutSearch(window.location.search)

function initialPlayersByMode() {
  if (!publicLayout) return { doubles: doublesSeed, singles: singlesSeed }
  if (publicLayout.mode === 'doubles') return { doubles: publicLayout.players, singles: singlesSeed }
  return { doubles: doublesSeed, singles: publicLayout.players }
}

function initialActiveByMode(): Record<MatchMode, string[]> {
  const doubles = ['a1']
  const singles = ['a1']
  if (publicLayout?.mode === 'doubles') return { doubles: publicLayout.activeIds, singles }
  if (publicLayout?.mode === 'singles') return { doubles, singles: publicLayout.activeIds }
  return { doubles, singles }
}

const ZOOM_MIN = 0.8
const ZOOM_MAX = 1.5

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return <div className="control-block">
    <span className="control-label">{label}</span>
    <div className="segmented">
      {options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  </div>
}

export default function App() {
  const [mode, setMode] = useState<MatchMode>(publicLayout?.mode ?? 'doubles')
  const [playersByMode, setPlayersByMode] = useState(initialPlayersByMode)
  const [activeByMode, setActiveByMode] = useState<Record<MatchMode, string[]>>(initialActiveByMode)
  const [orientation, setOrientation] = useState<Orientation>('vertical')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rulerPos, setRulerPos] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [premise, setPremise] = useState(publicLayout?.premise ?? '')
  const [junior, setJunior] = useState(publicLayout?.junior ?? loadJuniorPref)
  const [slots, setSlots] = useState<Slot[]>(loadSlots)
  const [undoSnapshot, setUndoSnapshot] = useState<{ players: Player[]; activeIds: string[]; premise: string } | null>(null)
  const [shareNotice, setShareNotice] = useState('')
  const [presetState, setPresetState] = useState<{ tenkai: Tenkai | null; formationA: Formation | null; formationB: Formation | null }>({
    tenkai: publicLayout ? null : 'cross',
    formationA: publicLayout ? null : 'gankou',
    formationB: publicLayout ? null : 'gankou',
  })

  const players = playersByMode[mode]
  const activeIds = activeByMode[mode]
  const actives = activeIds
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => !!player)
  const editTarget = actives.length ? actives[actives.length - 1] : null

  const publicLayoutState = useMemo(() => ({
    v: 1 as const,
    mode,
    players,
    activeIds,
    premise,
    junior,
  }), [mode, players, activeIds, premise, junior])

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return buildShareUrl(window.location.href, publicLayoutState)
  }, [publicLayoutState])

  const holes = useMemo(
    () => actives.map((shooter) => weakestHole(shooter, players, mode, junior)).filter((hole) => hole !== null),
    [actives, players, mode, junior],
  )

  const distanceGroups = useMemo(() => {
    if (!actives.length) return null
    return actives.map((shooter) => ({
      shooter,
      rows: [...opponentDistances(shooter, players, mode)].sort(
        (a, b) => Math.max(b.outer.distance, b.center.distance) - Math.max(a.outer.distance, a.center.distance),
      ),
    }))
  }, [actives, players, mode])

  const toggleActive = (id: string) => {
    setActiveByMode((current) => {
      const ids = current[mode]
      const next = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]
      return { ...current, [mode]: next }
    })
  }

  const updateEditTarget = (patch: Partial<Player>) => {
    if (!editTarget) return
    setPlayersByMode((current) => ({
      ...current,
      [mode]: current[mode].map((player) => player.id === editTarget.id ? { ...player, ...patch } : player),
    }))
  }

  const applyZoom = (value: number) => {
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)))
  }

  const loadTenkai = (tenkai: Tenkai) => {
    setPlayersByMode((current) => ({ ...current, doubles: applyTenkai(current.doubles, tenkai) }))
    setPresetState({ tenkai, formationA: 'gankou', formationB: 'gankou' })
  }

  const loadFormation = (team: Team, formation: Formation) => {
    setPlayersByMode((current) => ({ ...current, doubles: applyFormation(current.doubles, team, formation) }))
    setPresetState((current) => ({
      tenkai: null,
      formationA: team === 'A' ? formation : current.formationA,
      formationB: team === 'B' ? formation : current.formationB,
    }))
  }

  const handlePlayersChange = (next: Player[]) => {
    setPlayersByMode((current) => ({ ...current, [mode]: next }))
    if (mode === 'doubles') setPresetState({ tenkai: null, formationA: null, formationB: null })
  }

  const reset = () => {
    setUndoSnapshot({ players, activeIds, premise })
    setPlayersByMode((current) => ({ ...current, [mode]: mode === 'doubles' ? doublesSeed : singlesSeed }))
    setActiveByMode((current) => ({ ...current, [mode]: ['a1'] }))
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRulerPos({ x: null, y: null })
    setPresetState({ tenkai: 'cross', formationA: 'gankou', formationB: 'gankou' })
    setPremise('')
  }

  const undoReset = () => {
    if (!undoSnapshot) return
    setPlayersByMode((current) => ({ ...current, [mode]: undoSnapshot.players }))
    setActiveByMode((current) => ({ ...current, [mode]: undoSnapshot.activeIds }))
    setPremise(undoSnapshot.premise)
    setPresetState({ tenkai: null, formationA: null, formationB: null })
    setUndoSnapshot(null)
  }

  const saveSlotsLocal = (next: Slot[]) => {
    setSlots(next)
    try {
      persistSlots(next)
    } catch {
      // 端末内保存できない環境でも画面上の状態は維持する
    }
  }

  const saveSlot = (index: number) => {
    if (slots[index] && !window.confirm('この端末内の枠を上書きしますか？以前の配置は消えます（共有URLには影響しません）。')) return
    const now = new Date()
    const stamp = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const name = premise.trim() || `${mode === 'doubles' ? 'ダブルス' : 'シングルス'} ${stamp}`
    saveSlotsLocal(slots.map((slot, i) => i === index ? { name, mode, players, activeIds, premise } : slot))
  }

  const loadSlot = (index: number) => {
    const slot = slots[index]
    if (!slot) return
    setMode(slot.mode)
    setPlayersByMode((current) => ({ ...current, [slot.mode]: slot.players }))
    setActiveByMode((current) => ({ ...current, [slot.mode]: slot.activeIds }))
    setPremise(slot.premise)
    setPresetState({ tenkai: null, formationA: null, formationB: null })
  }

  const clearSlot = (index: number) => {
    if (!window.confirm('この端末内の枠を削除しますか？')) return
    saveSlotsLocal(slots.map((slot, i) => i === index ? null : slot))
  }

  const rotate = () => {
    setOrientation((current) => current === 'vertical' ? 'horizontal' : 'vertical')
    setPan({ x: 0, y: 0 })
    setRulerPos({ x: null, y: null })
  }

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareNotice('配置リンクをコピーしました（流入パラメータは含みません）')
    } catch {
      setShareNotice('コピーできませんでした。アドレスバーのリンクを共有してください')
    }
  }

  const changeJunior = (value: boolean) => {
    setJunior(value)
    persistJuniorPref(value)
  }

  useEffect(() => {
    if (!undoSnapshot) return
    const timer = setTimeout(() => setUndoSnapshot(null), 7000)
    return () => clearTimeout(timer)
  }, [undoSnapshot])

  useEffect(() => {
    if (!shareNotice) return
    const timer = setTimeout(() => setShareNotice(''), 4000)
    return () => clearTimeout(timer)
  }, [shareNotice])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history.replaceState) return
    const params = new URLSearchParams(window.location.search)
    if (!params.has('src')) return
    params.delete('src')
    const next = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`)
  }, [])

  const statusHeading = actives.length
    ? `${actives.map((player) => player.label).join('・')}を分析中`
    : '選手をタップして分析開始'
  const statusBody = actives.length === 0
    ? 'タップした選手の打点から、セオリー線とデッドゾーンを表示します。複数人の同時表示もできます。'
    : actives.length === 1
      ? '打点から3本のセオリー線と返球エリアを表示中。もう一度タップで解除、他の選手をタップで追加表示できます。'
      : `利き手・打球面の設定は、最後にタップした${editTarget?.label}に適用されます。デッドゾーン（斜線）は1人選択のときだけ表示します。`

  const editRole: PlayerRole = editTarget?.role ?? (mode === 'singles' ? 'all' : 'back')
  const defenderGuide = reachThresholds({ role: editTarget?.role ?? 'back', junior })

  return <main className="app-shell">
    <header className="app-header">
      <div className="brand-mark">ST</div>
      <div>
        <h1>陣形ラボ</h1>
        <p>ソフトテニスIQ｜コートポジション分析</p>
      </div>
      <div className="header-actions">
        <button type="button" className="icon-button" onClick={reset}><RotateCcw size={18} />リセット</button>
        <button type="button" className="icon-button" onClick={rotate}><RotateCw size={18} />コート回転</button>
      </div>
    </header>

    <aside className={`settings-drawer ${settingsOpen ? 'open' : ''}`} aria-label="設定パネル">
      <button type="button" className="drawer-handle" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}>
        <Settings size={16} />
        <span>設定</span>
      </button>
      <div className="drawer-body">
        <div className="control-grid">
          <Segmented value={mode} label="モード" options={[{ value: 'doubles', label: 'ダブルス' }, { value: 'singles', label: 'シングルス' }]} onChange={setMode} />
          <Segmented<Handedness> value={editTarget?.hand ?? 'right'} label="利き手" options={[{ value: 'right', label: '右利き' }, { value: 'left', label: '左利き' }]} onChange={(hand) => updateEditTarget({ hand })} />
          <Segmented<Stroke> value={editTarget?.stroke ?? 'fore'} label="打球面" options={[{ value: 'fore', label: 'フォア' }, { value: 'back', label: 'バック' }]} onChange={(stroke) => updateEditTarget({ stroke })} />
          {mode === 'doubles' && <Segmented<PlayerRole> value={editRole === 'all' ? 'back' : editRole} label="役割（到達目安）" options={[{ value: 'back', label: '後衛' }, { value: 'front', label: '前衛' }]} onChange={(role) => updateEditTarget({ role })} />}
          <Segmented value={junior ? 'junior' : 'adult'} label="到達の物差し" options={[{ value: 'adult', label: '一般' }, { value: 'junior', label: 'ジュニア' }]} onChange={(value) => changeJunior(value === 'junior')} />
        </div>

        {mode === 'doubles' && <div className="preset-panel">
          <div className="preset-block">
            <span className="control-label">展開プリセット（両チーム一括・雁行陣）</span>
            <div className="preset-grid cols-2">
              {TENKAI_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={presetState.tenkai === option.value ? 'selected' : ''} onClick={() => loadTenkai(option.value)}>{option.label}</button>
              ))}
            </div>
          </div>
          {(['A', 'B'] as Team[]).map((team) => (
            <div className="preset-block" key={team}>
              <span className="control-label">{team}チームの陣形</span>
              <div className="preset-grid cols-3">
                {FORMATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={(team === 'A' ? presetState.formationA : presetState.formationB) === option.value ? 'selected' : ''}
                    onClick={() => loadFormation(team, option.value)}
                  >{option.label}</button>
                ))}
              </div>
            </div>
          ))}
          <p className="preset-note">監修済みの基準配置を読み込みます。雁行陣は前衛=ネットからラケット1.5〜2本分・後衛=ベースラインからラケット1本分後方が基準。ここから相手の位置・体勢・風などに合わせて随時ずらします。展開の左右はAチーム（手前）から見た呼称。</p>
        </div>}

        <div className="premise-panel">
          <span className="control-label">前提メモ（コート左上に表示・保存名にも使用）</span>
          <input
            className="premise-input"
            type="text"
            maxLength={30}
            placeholder="例: 相手セカンドサーブ・ラリー中盤"
            value={premise}
            onChange={(event) => setPremise(event.target.value)}
          />
        </div>

        <div className="slots-panel">
          <span className="control-label">配置メモリ（この端末のブラウザ内のみ・3枠。共有や計測には送りません）</span>
          {slots.map((slot, index) => (
            <div className="slot-row" key={index}>
              {slot ? <>
                <button type="button" className="slot-load" onClick={() => loadSlot(index)} title="この配置を読み込む">{slot.name}</button>
                <button type="button" className="slot-mini" onClick={() => saveSlot(index)} title="今の配置で上書き">上書き</button>
                <button type="button" className="slot-mini danger" onClick={() => clearSlot(index)} title="削除">削除</button>
              </> : <button type="button" className="slot-empty" onClick={() => saveSlot(index)}>空きスロット{index + 1}｜今の配置を保存</button>}
            </div>
          ))}
        </div>

        <div className="status-panel">
          <span className="eyeline">選択中</span>
          <strong>{statusHeading}</strong>
          <p>{statusBody}</p>
        </div>

        <div className="instruction-panel">
          <h3>操作</h3>
          <ol>
            <li>選手をタップでエリア表示／もう一度タップで解除（全員分・最大4人まで同時表示）</li>
            <li>選手をドラッグして配置。コートは空白ドラッグでスライド、2本指でズーム</li>
            <li>ラケット定規はつかんで平行移動できる（測りたい場所に当てる）</li>
            <li>距離パネルとコート上の「今の穴」で、相手がラケット何本分で届くかをチェック</li>
            <li>リンク共有は今の配置だけを含みます。端末内メモリとは別物です</li>
          </ol>
        </div>
      </div>
    </aside>

    <section className="workspace">
      <div className="canvas-column">
        <div className="canvas-toolbar">
          <div className="legend">
            <span><i className="dot team-a" />Aチーム</span>
            <span><i className="dot team-b" />Bチーム</span>
            <span><i className="swatch theory" />セオリー内（球が来る範囲）</span>
            <span><i className="swatch dead" />デッドゾーン（球が来ない）</span>
            <span><i className="dot contact" />打点</span>
            <span className="legend-scale">
              <svg width="26" height="12" viewBox="0 0 0.74 0.3" aria-hidden="true">
                <g stroke="#0f5f63" fill="none">
                  <ellipse cx="0.2" cy="0.15" rx="0.18" ry="0.12" strokeWidth="0.05" />
                  <line x1="0.38" y1="0.15" x2="0.48" y2="0.15" strokeWidth="0.055" />
                  <rect x="0.48" y="0.1" width="0.19" height="0.1" rx="0.05" fill="#0f5f63" stroke="none" />
                </g>
              </svg>
              ラケット1本分 = 0.69m
            </span>
          </div>
          <div className="zoom-controls">
            <button type="button" aria-label="縮小" onClick={() => applyZoom(+(zoom - 0.1).toFixed(2))}><ZoomOut size={18} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="拡大" onClick={() => applyZoom(+(zoom + 0.1).toFixed(2))}><ZoomIn size={18} /></button>
          </div>
        </div>
        <CourtCanvas
          mode={mode}
          orientation={orientation}
          players={players}
          activeIds={activeIds}
          zoom={zoom}
          pan={pan}
          rulerPos={rulerPos}
          premise={premise}
          junior={junior}
          holes={holes}
          shareUrl={shareUrl}
          onPlayersChange={handlePlayersChange}
          onToggleActive={toggleActive}
          onZoomChange={applyZoom}
          onPanChange={setPan}
          onRulerPosChange={setRulerPos}
          onShareUrl={copyShareUrl}
          onShareNotice={setShareNotice}
        />
      </div>

      <aside className="distance-card">
        <div>
          <span className="eyeline">担当コース（近い外側とセンター）までラケット何本分か</span>
          <h2>相手の守備範囲</h2>
        </div>
        {distanceGroups ? distanceGroups.map((group) => (
          <div className="distance-group" key={group.shooter.id}>
            <h3 className="distance-shooter">打者: {group.shooter.label}</h3>
            {group.rows.map((entry) => {
              const defender = players.find((player) => player.id === entry.playerId)
              return (
              <div className="distance-row" key={entry.playerId}>
                <div className="distance-head">
                  <strong>{entry.label}</strong>
                </div>
                {[
                  { key: 'outer', label: entry.outer.side === 'left' ? '左コース' : '右コース', measureItem: entry.outer },
                  { key: 'center', label: 'センター', measureItem: entry.center },
                ].map(({ key, label, measureItem }) => {
                  const tier = reachTier(measureItem.distance, { role: defender?.role ?? 'all', junior })
                  return (
                    <div className="distance-side" key={key}>
                      <div className="distance-side-head">
                        <span className="distance-course">{label}</span>
                        <span className="distance-value">{`約 ${(measureItem.distance / RACKET_LENGTH).toFixed(1)} 本`}</span>
                        <span className={`distance-badge tier-${tier}`}>{TIER_LABEL[tier]}</span>
                      </div>
                      <div className="distance-bar"><i className={`tier-${tier}`} style={{ width: `${(Math.min(measureItem.distance, 6) / 6) * 100}%` }} /></div>
                    </div>
                  )
                })}
              </div>
              )
            })}
          </div>
        )) : <p className="distance-empty">選手をタップすると、相手選手ごとの距離を表示します。</p>}
        <small>
          判定は守る側の役割で変えています。今の目安は
          {junior ? 'ジュニア' : '一般'}・{editTarget?.role === 'front' ? '前衛' : editTarget?.role === 'back' ? '後衛' : 'シングルス'}で
          {defenderGuide.cover}本以内=カバー／{defenderGuide.stretch}本以内=踏み込み／それ以上=リーチ外。
          平面距離であり、球速・高さ・回転は見ていません。ラケット長は共通単位、ジュニアは歩幅を短く見た閾値です。
        </small>
      </aside>
    </section>

    {undoSnapshot && <div className="undo-toast" role="status">
      リセットしました
      <button type="button" onClick={undoReset}>元に戻す</button>
    </div>}
    {shareNotice && <div className="undo-toast" role="status">{shareNotice}</div>}
  </main>
}
