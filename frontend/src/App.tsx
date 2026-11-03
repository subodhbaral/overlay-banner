import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Rnd } from 'react-rnd'
import { api, apiUrl } from './api/client'
import type { AdCategory, AdCreative, AnalyticsReport, AnalyticsTimeline, StreamStatusResponse } from './types'
import './App.css'

type Overlay = { xPct: number; yPct: number; widthPct: number; heightPct: number }
type Point = { start: string; count: number }
type Slice = { label: string; count: number }
type Notice = { kind: 'success' | 'error'; text: string }

const PIE_COLORS = ['#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#38bdf8', '#a3e635']

export default function App() {
  const [view, setView] = useState<'control' | 'analytics'>('control')
  const [status, setStatus] = useState<StreamStatusResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [ads, setAds] = useState<AdCreative[]>([])
  const [selected, setSelected] = useState<AdCreative | null>(null)
  const [overlay, setOverlay] = useState<Overlay>({ xPct: 0, yPct: 0, widthPct: 25, heightPct: 30 })
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState(20)
  const [transition, setTransition] = useState(1)
  const [filter, setFilter] = useState<'all' | AdCategory>('all')
  const [notice, setNotice] = useState<Notice | null>(null)
  const busyRef = useRef(false)

  const isOn = status?.status === 'ON'
  const manifestUrl = apiUrl('/manifest/master.m3u8')

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getConfig(), api.getAds()])
      .then(([config, catalog]) => {
        if (cancelled) return
        setUrl(config.hlsInputUrl)
        setDuration(config.overlay.insertionDurationSec)
        setTransition(config.overlay.transitionDurationSec)
        setAds(catalog)
        const ad = catalog.find((item) => item.id === config.overlay.adId) ?? catalog[0] ?? null
        setSelected(ad)
        if (ad && ad.id === config.overlay.adId) {
          setOverlay(constrainOverlay(ad, {
            xPct: config.overlay.xPct,
            yPct: config.overlay.yPct,
            widthPct: config.overlay.widthPct,
            heightPct: config.overlay.heightPct,
          }))
        } else if (ad) {
          setOverlay(overlayFromAd(ad))
        }
        setLoaded(true)
      })
      .catch((err: Error) => {
        if (!cancelled) setNotice({ kind: 'error', text: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadStatus() {
      if (busyRef.current) return
      try {
        const next = await api.streamStatus()
        if (!cancelled) setStatus(next)
      } catch (err) {
        if (!cancelled) setNotice({ kind: 'error', text: (err as Error).message })
      }
    }
    loadStatus()
    const timer = window.setInterval(loadStatus, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (notice?.kind !== 'success') return
    const timer = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const selectAd = (ad: AdCreative) => {
    setSelected(ad)
    setOverlay(overlayFromAd(ad))
  }

  const saveConfig = async () => {
    if (!selected) throw new Error('Select a creative before saving.')
    return api.saveConfig({
      hlsInputUrl: url.trim(),
      overlay: {
        adId: selected.id,
        xPct: overlay.xPct,
        yPct: overlay.yPct,
        widthPct: overlay.widthPct,
        heightPct: overlay.heightPct,
        insertionDurationSec: duration,
        transitionDurationSec: transition,
      },
    })
  }

  const toggleStream = async () => {
    setBusy(true)
    setNotice(null)
    try {
      if (!isOn) {
        await saveConfig()
        setStatus(await api.streamOn())
      } else {
        setStatus(await api.streamOff())
      }
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await saveConfig()
      setNotice({ kind: 'success', text: 'Configuration saved.' })
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const insertAd = async () => {
    if (!selected) return
    setBusy(true)
    setNotice(null)
    try {
      await saveConfig()
      await api.insert({
        adId: selected.id,
        durationSec: duration,
        xPct: overlay.xPct,
        yPct: overlay.yPct,
        widthPct: overlay.widthPct,
        heightPct: overlay.heightPct,
      })
      setNotice({ kind: 'success', text: 'Insertion job queued for transcoding.' })
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const copyManifest = async () => {
    const copied = await copyText(manifestUrl)
    setNotice(
      copied
        ? { kind: 'success', text: 'Manifest URL copied.' }
        : { kind: 'error', text: 'Could not copy the manifest URL. Select it and copy manually.' },
    )
  }

  return (
    <AppShell
      view={view}
      onNavigate={setView}
      isOn={isOn}
      pending={status === null}
      profileCount={status?.profileCount ?? 0}
      lastError={status?.lastError ?? undefined}
      channelId={status?.channelId}
    >
      {notice && <div className={notice.kind === 'error' ? 'alert error' : 'alert success'}>{notice.text}</div>}
      {!loaded ? (
        <p className="hint">Loading channel…</p>
      ) : view === 'analytics' ? (
        <AnalyticsView />
      ) : (
        <main className="control-layout">
          <section className="preview-column">
            <div className="section-heading">
              <div>
                <p className="eyebrow">OUTPUT MONITOR</p>
                <h2>Program</h2>
              </div>
              <span className={isOn ? 'live-dot on' : 'live-dot'}>{isOn ? 'LIVE' : 'STANDBY'}</span>
            </div>
            <ProgramPreview ad={selected} overlay={overlay} onChange={setOverlay} />
          </section>
          <CreativeCatalog ads={ads} selectedId={selected?.id ?? ''} filter={filter} onFilter={setFilter} onSelect={selectAd} />
          <ChannelInspector
            url={url}
            duration={duration}
            transition={transition}
            isOn={isOn}
            pending={status === null}
            busy={busy}
            hasAd={!!selected}
            manifestUrl={manifestUrl}
            onUrlChange={setUrl}
            onDurationChange={setDuration}
            onTransitionChange={setTransition}
            onToggle={toggleStream}
            onSave={save}
            onInsert={insertAd}
            onCopyManifest={copyManifest}
          />
        </main>
      )}
    </AppShell>
  )
}

async function copyText(value: string): Promise<boolean> {
  const viaClipboard = navigator.clipboard.writeText(value).then(
    () => true,
    () => false,
  )
  const timedOut = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 400))
  if (await Promise.race([viaClipboard, timedOut])) return true
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

const BANNER_MIN_WIDTH_PCT = 50
const BANNER_MAX_WIDTH_PCT = 100
const LSHAPE_MIN_PCT = 80
const LSHAPE_MAX_PCT = 100
const EDGE_RESIZE = {
  top: true,
  right: true,
  topRight: true,
  bottom: false,
  left: false,
  bottomLeft: false,
  bottomRight: false,
  topLeft: false,
} as const

function bannerWidthLimit(): { min: number; max: number } {
  return { min: BANNER_MIN_WIDTH_PCT, max: BANNER_MAX_WIDTH_PCT }
}

function lShapeLimit(): { min: number; max: number } {
  return { min: LSHAPE_MIN_PCT, max: LSHAPE_MAX_PCT }
}

function placementFromResize(
  ad: AdCreative,
  dir: string,
  widthPx: number,
  heightPx: number,
  frameWidth: number,
  frameHeight: number,
  current: Overlay,
): Overlay {
  const widthPct = toPct(widthPx, frameWidth)
  const heightPct = toPct(heightPx, frameHeight)
  if (ad.category === 'l-shape') {
    const driven = dir === 'top' || dir === 'bottom' ? heightPct : widthPct
    return constrainOverlay(ad, { xPct: 0, yPct: 0, widthPct: driven, heightPct: driven })
  }
  const vertical = dir === 'top' || dir === 'bottom'
  const horizontal = dir === 'left' || dir === 'right'
  return constrainOverlay(ad, {
    xPct: 0,
    yPct: 0,
    widthPct: vertical ? current.widthPct : widthPct,
    heightPct: horizontal ? current.heightPct : heightPct,
  })
}

function overlayFromAd(ad: AdCreative): Overlay {
  if (ad.category === 'bottom-banner') {
    return constrainOverlay(ad, {
      xPct: 0,
      yPct: 0,
      widthPct: BANNER_MAX_WIDTH_PCT,
      heightPct: ad.defaultHeightPct,
    })
  }
  return constrainOverlay(ad, {
    xPct: 0,
    yPct: 0,
    widthPct: LSHAPE_MAX_PCT,
    heightPct: LSHAPE_MAX_PCT,
  })
}

/** Bottom banners sit on the bottom edge. L-shapes sit in the bottom-left and keep width and height equal. */
function constrainOverlay(ad: AdCreative, overlay: Overlay): Overlay {
  if (ad.category === 'bottom-banner') {
    const heightPct = clamp(overlay.heightPct, ad.minHeightPct, ad.maxHeightPct)
    const widthPct = clamp(overlay.widthPct, BANNER_MIN_WIDTH_PCT, BANNER_MAX_WIDTH_PCT)
    return { xPct: 0, yPct: 100 - heightPct, widthPct, heightPct }
  }

  const size = clamp(overlay.widthPct, LSHAPE_MIN_PCT, LSHAPE_MAX_PCT)
  return { xPct: 0, yPct: 100 - size, widthPct: size, heightPct: size }
}

export function AppShell({
  children,
  view,
  onNavigate,
  isOn,
  pending,
  profileCount,
  lastError,
  channelId = 'default',
}: {
  children: ReactNode
  view: 'control' | 'analytics'
  onNavigate: (view: 'control' | 'analytics') => void
  isOn: boolean
  pending?: boolean
  profileCount: number
  lastError?: string
  channelId?: string
}) {
  return (
    <div className="app-shell">
      <aside className="rail">
        <div>
          <div className="wordmark">
            <span className="wordmark-mark">O</span> Overlay
          </div>
          <div className="channel-id">
            CHANNEL <strong>{channelId}</strong>
          </div>
          <nav>
            <button className={view === 'control' ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate('control')}>
              <span>◫</span> Control
            </button>
            <button className={view === 'analytics' ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate('analytics')}>
              <span>◒</span> Analytics
            </button>
          </nav>
        </div>
        <StreamStatus isOn={isOn} pending={pending} profileCount={profileCount} lastError={lastError} />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">BROADCAST OPERATIONS / {view.toUpperCase()}</p>
            <h1>{view === 'control' ? 'Channel' : 'Analytics'}</h1>
            <p className="subtitle">
              {view === 'control'
                ? 'Configure overlay placement and manage the live output.'
                : 'Viewer and insertion telemetry for the default channel.'}
            </p>
          </div>
          {view === 'analytics' && (
            <span className="refresh-note">
              Refreshes every 5s <span className="refresh-dot" />
            </span>
          )}
        </header>
        {children}
      </div>
    </div>
  )
}

export function StreamStatus({
  isOn,
  pending,
  profileCount,
  lastError,
}: {
  isOn: boolean
  pending?: boolean
  profileCount: number
  lastError?: string
}) {
  const label = pending ? '…' : isOn ? 'ON' : 'OFF'
  return (
    <div className="rail-status">
      <div className="status-row">
        <span className={!pending && isOn ? 'status-pill on' : 'status-pill off'}>
          <span className="status-dot" /> {label}
        </span>
        <span className="profile-count">{profileCount} profiles</span>
      </div>
      {lastError && <p className="error-copy">{lastError}</p>}
    </div>
  )
}

export function CreativeCatalog({
  ads,
  selectedId,
  filter,
  onFilter,
  onSelect,
}: {
  ads: AdCreative[]
  selectedId: string
  filter: 'all' | AdCategory
  onFilter: (filter: 'all' | AdCategory) => void
  onSelect: (ad: AdCreative) => void
}) {
  const filtered = ads.filter((ad) => filter === 'all' || ad.category === filter)
  return (
    <section className="catalog panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LIBRARY</p>
          <h2>Creatives</h2>
        </div>
        <span className="muted">{filtered.length} assets</span>
      </div>
      <div className="filter-row">
        {(['all', 'l-shape', 'bottom-banner'] as const).map((item) => (
          <button key={item} className={filter === item ? 'chip selected' : 'chip'} onClick={() => onFilter(item)}>
            {item === 'all' ? 'All' : item === 'l-shape' ? 'L-shape' : 'Bottom banner'}
          </button>
        ))}
      </div>
      <div className="creative-list">
        {filtered.map((ad) => (
          <button
            key={ad.id}
            className={selectedId === ad.id ? 'creative-card selected' : 'creative-card'}
            onClick={() => onSelect(ad)}
          >
            <img src={ad.imageUrl} alt="" />
            <div className="creative-info">
              <strong>{ad.name}</strong>
              <span>{ad.category === 'l-shape' ? 'L-shape' : 'Bottom banner'}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

export function ProgramPreview({
  ad,
  overlay,
  onChange,
}: {
  ad: AdCreative | null
  overlay: Overlay
  onChange: (overlay: Overlay) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const update = () => setFrame({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const widthPx = toPx(overlay.widthPct, frame.width)
  const heightPx = toPx(overlay.heightPct, frame.height)

  return (
    <div>
      <div className="program-frame" ref={frameRef}>
        <div className="hatch">
          <span>Live video</span>
          <small>16:9 PROGRAM FEED</small>
        </div>
        {ad && frame.width > 0 && (
          <Rnd
            className="overlay-box anchored"
            disableDragging
            dragAxis="none"
            enableResizing={EDGE_RESIZE}
            size={{ width: widthPx, height: heightPx }}
            position={{ x: toPx(overlay.xPct, frame.width), y: toPx(overlay.yPct, frame.height) }}
            minWidth={toPx(ad.category === 'l-shape' ? lShapeLimit().min : bannerWidthLimit().min, frame.width)}
            maxWidth={toPx(ad.category === 'l-shape' ? lShapeLimit().max : bannerWidthLimit().max, frame.width)}
            minHeight={toPx(ad.category === 'l-shape' ? lShapeLimit().min : ad.minHeightPct, frame.height)}
            maxHeight={toPx(ad.category === 'l-shape' ? lShapeLimit().max : ad.maxHeightPct, frame.height)}
            onResize={(_event, dir, ref) => {
              onChange(placementFromResize(ad, dir, ref.offsetWidth, ref.offsetHeight, frame.width, frame.height, overlay))
            }}
            onResizeStop={(_event, dir, ref) => {
              onChange(placementFromResize(ad, dir, ref.offsetWidth, ref.offsetHeight, frame.width, frame.height, overlay))
            }}
          >
            <img src={ad.imageUrl} alt="" draggable={false} />
            <span>{ad.name}</span>
          </Rnd>
        )}
      </div>
      <div className="readouts">
        {(['xPct', 'yPct', 'widthPct', 'heightPct'] as const).map((key, index) => (
          <div key={key}>
            <span>{['X', 'Y', 'W', 'H'][index]}</span>
            <strong>{overlay[key].toFixed(1)}%</strong>
          </div>
        ))}
      </div>
      <p className="hint">
        {ad?.category === 'bottom-banner'
          ? 'Stays on the bottom edge. Height stays within the creative limits. Width starts full and can shrink to half the frame.'
          : 'Stays in the bottom-left corner. Width and height change together, from the full frame down to 80%.'}
      </p>
    </div>
  )
}

export function ChannelInspector({
  url,
  duration,
  transition,
  isOn,
  pending,
  busy,
  hasAd,
  manifestUrl,
  onUrlChange,
  onDurationChange,
  onTransitionChange,
  onToggle,
  onSave,
  onInsert,
  onCopyManifest,
}: {
  url: string
  duration: number
  transition: number
  isOn: boolean
  pending?: boolean
  busy: boolean
  hasAd: boolean
  manifestUrl: string
  onUrlChange: (value: string) => void
  onDurationChange: (value: number) => void
  onTransitionChange: (value: number) => void
  onToggle: () => void
  onSave: () => void
  onInsert: () => void
  onCopyManifest: () => void
}) {
  const label = pending ? 'Checking' : isOn ? 'Turn off' : 'Turn on'
  return (
    <section className="inspector panel">
      <div className="inspector-head">
        <div>
          <p className="eyebrow">CHANNEL CONFIGURATION</p>
          <h2>Inspector</h2>
        </div>
        <button className={isOn ? 'button danger' : 'button primary'} onClick={onToggle} disabled={busy || pending}>
          {busy && <span className="spinner" />}
          {label}
        </button>
      </div>
      <div className="inspector-status">
        <span className={!pending && isOn ? 'status-pill on' : 'status-pill off'}>
          <span className="status-dot" /> {pending ? '…' : isOn ? 'ON' : 'OFF'}
        </span>
        <span>{pending ? 'Checking channel' : isOn ? 'Output is live' : 'Output is stopped'}</span>
      </div>
      {isOn && (
        <label>
          Output manifest
          <div className="output-url">
            <input readOnly value={manifestUrl} aria-label="Output main manifest URL" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="button secondary" onClick={onCopyManifest}>
              Copy
            </button>
          </div>
          <small>Main playlist for players.</small>
        </label>
      )}
      <label>
        HLS input URL
        <input value={url} onChange={(e) => onUrlChange(e.target.value)} disabled={isOn || pending} />
        <small>Locked while the channel is live.</small>
      </label>
      <div className="field-grid">
        <label>
          Insertion duration
          <input type="number" min="1" value={duration} onChange={(e) => onDurationChange(Number(e.target.value))} />
          <small>seconds</small>
        </label>
        <label>
          Transition duration
          <input type="number" min="0" step="0.1" value={transition} onChange={(e) => onTransitionChange(Number(e.target.value))} />
          <small>seconds</small>
        </label>
      </div>
      <div className="inspector-actions">
        <button className="button secondary" onClick={onSave} disabled={busy}>
          Save configuration
        </button>
        <button className="button amber" onClick={onInsert} disabled={busy || !isOn || !hasAd}>
          Burn Image Now
        </button>
      </div>
      {!pending && !isOn && <p className="hint">Turn the channel on to insert.</p>}
    </section>
  )
}

export function AnalyticsView() {
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api.getAnalytics()
        if (!cancelled) {
          setReport(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }
    load()
    const timer = window.setInterval(load, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (!report && error) return <div className="alert error">{error}</div>
  if (!report) return <p className="hint">Loading analytics…</p>

  const windowMin = Math.round(report.activeWindowMs / 60000)
  const stats: [string, string, string][] = [
    ['Active sessions', String(report.sessions.activeCount), `seen in the last ${windowMin} min`],
    ['Unique sessions', String(report.sessions.uniqueCount), 'all recorded viewers'],
    ['Ad views', String(report.insertions.viewCount), 'heartbeat events'],
    ['Insertions', String(report.insertions.uniqueCount), 'distinct overlay breaks'],
    ['Ad time delivered', formatDuration(report.insertions.totalDurationSec), 'sum of viewed durations'],
  ]

  return (
    <div className="analytics-view">
      {error && <div className="alert error">{error}</div>}
      <div className="stat-grid">
        {stats.map(([label, value, hint]) => (
          <StatCard key={label} label={label} value={value} hint={hint} />
        ))}
      </div>
      <div className="chart-grid">
        <ChartPanel title="Sessions by device">
          <PieChart data={report.sessions.byDevice} />
        </ChartPanel>
        <ChartPanel title="Views by category">
          <PieChart data={report.insertions.byCategory} />
        </ChartPanel>
        <ChartPanel title="Views and duration by ad">
          <BarChart
            data={report.insertions.byAd.map((ad) => ({
              label: ad.adId,
              count: ad.views,
              detail: formatDuration(ad.durationSec),
            }))}
          />
        </ChartPanel>
        <ChartPanel title="Sessions over time">
          <LineChart data={pointsFrom(report.sessions.timeline)} />
        </ChartPanel>
        <ChartPanel title="Ad views over time">
          <LineChart data={pointsFrom(report.insertions.timeline)} />
        </ChartPanel>
      </div>
      <DataTable
        title="Active sessions"
        headers={['Session', 'Device', 'Profile', 'Last seen']}
        rows={report.sessions.active.map((session) => [
          session.sessionId.slice(0, 8),
          session.device,
          session.profileId ?? '—',
          formatAgo(report.generatedAt - session.lastSeen),
        ])}
        empty={`No viewer has hit the manifest in the last ${windowMin} minutes.`}
      />
      <DataTable
        title="Recent ad views"
        headers={['When', 'Ad', 'Category', 'Duration', 'Device', 'Session']}
        rows={report.insertions.recent.map((event) => [
          formatClock(event.timestamp),
          event.adId,
          labelFor(event.category),
          formatDuration(event.durationSec),
          event.device,
          event.sessionId.slice(0, 8),
        ])}
        empty="No insertion heartbeats yet."
      />
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  )
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="chart-panel">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function PieChart({ data }: { data: Slice[] }) {
  const slices = data.filter((item) => item.count > 0)
  if (!slices.length) return <EmptyChart />
  return (
    <div className="pie-wrap">
      <div className="pie" style={{ background: pieBackground(slices) }} />
      <div className="legend">
        {slices.map((item, index) => (
          <span key={item.label}>
            <i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
            {labelFor(item.label)}
            <b>{item.count}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export function BarChart({ data }: { data: { label: string; count: number; detail: string }[] }) {
  if (!data.length) return <EmptyChart />
  const max = Math.max(...data.map((item) => item.count), 1)
  return (
    <div className="bar-list">
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <div>
            <span>{item.label}</span>
            <b>
              {item.count} views · {item.detail}
            </b>
          </div>
          <div className="bar-track">
            <i style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LineChart({ data }: { data: Point[] }) {
  if (!data.length) return <EmptyChart />
  const max = Math.max(...data.map((item) => item.count), 1)
  const points = data
    .map((item, index) => `${(index / Math.max(data.length - 1, 1)) * 100},${82 - (item.count / max) * 58}`)
    .join(' ')
  return (
    <div className="line-wrap">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Line chart">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.map((item, index) => (
          <circle
            key={`${item.start}-${index}`}
            cx={(index / Math.max(data.length - 1, 1)) * 100}
            cy={82 - (item.count / max) * 58}
            r="2.4"
            fill="currentColor"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="axis-labels">
        <span>{data[0].start}</span>
        <span>{data[data.length - 1].start}</span>
      </div>
    </div>
  )
}

function EmptyChart() {
  return <div className="empty-chart">No data yet.</div>
}

function DataTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows?: string[][]; empty?: string }) {
  const filled = rows && rows.length > 0
  return (
    <section className="table-panel">
      <h3>{title}</h3>
      {filled ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${row.join('-')}-${rowIndex}`}>
                  {row.map((cell, index) => (
                    <td key={`${cell}-${index}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-empty">{empty}</div>
      )}
    </section>
  )
}

function pieBackground(data: Slice[]): string {
  const total = data.reduce((sum, item) => sum + item.count, 0) || 1
  let cursor = 0
  const stops = data.map((item, index) => {
    const start = (cursor / total) * 360
    cursor += item.count
    const end = (cursor / total) * 360
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}deg ${end}deg`
  })
  return `conic-gradient(${stops.join(',')})`
}

function pointsFrom(timeline: AnalyticsTimeline): Point[] {
  return timeline.points.map((point) => ({
    start: bucketLabel(point.start, timeline.bucketMs),
    count: point.count,
  }))
}

function labelFor(value: string): string {
  if (value === 'l-shape') return 'L-shape'
  if (value === 'bottom-banner') return 'Bottom banner'
  if (value === 'unknown') return 'Unknown'
  return value
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded}s`
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

function formatAgo(deltaMs: number): string {
  const seconds = Math.max(0, Math.round(deltaMs / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function bucketLabel(start: number, bucketMs: number): string {
  const date = new Date(start)
  if (bucketMs >= 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function toPx(pct: number, dim: number): number {
  return (pct / 100) * dim
}

function toPct(px: number, dim: number): number {
  return dim === 0 ? 0 : (px / dim) * 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
