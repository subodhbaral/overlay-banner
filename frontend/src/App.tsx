import { useState, type CSSProperties, type ReactNode } from 'react'
import './App.css'

type Category = 'l-shape' | 'bottom-banner'
export type Ad = { id: string; name: string; category: Category; imageUrl: string; minWidthPct: number; maxWidthPct: number; minHeightPct: number; maxHeightPct: number; default: Overlay }
export type Overlay = { xPct: number; yPct: number; widthPct: number; heightPct: number }
type Point = { start: string; count: number }
type Slice = { label: string; count: number }

const imageUrl = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-5EiH6Ba8brjmRyy6FbOX5flei4ALfm.png'
const ADS: Ad[] = [
  { id: 'l-shape-cupra', name: 'Cupra Born L-Shape', category: 'l-shape', imageUrl, minWidthPct: 15, maxWidthPct: 35, minHeightPct: 20, maxHeightPct: 45, default: { xPct: 0, yPct: 0, widthPct: 25, heightPct: 30 } },
  { id: 'bottom-banner-ottoman', name: 'Ottoman Media Bottom Banner', category: 'bottom-banner', imageUrl, minWidthPct: 40, maxWidthPct: 100, minHeightPct: 10, maxHeightPct: 25, default: { xPct: 0, yPct: 82, widthPct: 100, heightPct: 18 } },
]

export default function App() {
  const [view, setView] = useState<'control' | 'analytics'>('control')
  const [isOn, setIsOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Ad>(ADS[1])
  const [overlay, setOverlay] = useState<Overlay>(ADS[1].default)
  const [url, setUrl] = useState('https://elmcgtn-ioriver-cdn.encoders.immergo.tv/master.m3u8')
  const [duration, setDuration] = useState(20)
  const [transition, setTransition] = useState(1)
  const [filter, setFilter] = useState<'all' | Category>('all')
  const [notice, setNotice] = useState<string | null>(null)

  const selectAd = (ad: Ad) => { setSelected(ad); setOverlay(ad.default) }
  const toggleStream = () => { setBusy(true); window.setTimeout(() => { setIsOn(value => !value); setBusy(false) }, 450) }
  const insertAd = () => { setNotice('Insertion job queued for transcoding.'); window.setTimeout(() => setNotice(null), 3500) }

  return <AppShell view={view} onNavigate={setView} isOn={isOn} profileCount={isOn ? 2 : 0}>
    {notice && <div className="alert success">{notice}</div>}
    {view === 'analytics' ? <AnalyticsView /> : <main className="control-layout">
      <section className="preview-column">
        <div className="section-heading"><div><p className="eyebrow">OUTPUT MONITOR</p><h2>Program</h2></div><span className="live-dot">{isOn ? 'LIVE' : 'STANDBY'}</span></div>
        <ProgramPreview ad={selected} overlay={overlay} onChange={setOverlay} />
      </section>
      <CreativeCatalog ads={ADS} selectedId={selected.id} filter={filter} onFilter={setFilter} onSelect={selectAd} />
      <ChannelInspector url={url} duration={duration} transition={transition} isOn={isOn} busy={busy} hasAd={!!selected} onUrlChange={setUrl} onDurationChange={setDuration} onTransitionChange={setTransition} onToggle={toggleStream} onSave={() => setNotice('Configuration saved.')} onInsert={insertAd} />
    </main>}
  </AppShell>
}

export function AppShell({ children, view, onNavigate, isOn, profileCount, lastError }: { children: ReactNode; view: 'control' | 'analytics'; onNavigate: (view: 'control' | 'analytics') => void; isOn: boolean; profileCount: number; lastError?: string }) {
  return <div className="app-shell"><aside className="rail"><div><div className="wordmark"><span className="wordmark-mark">O</span> Overlay</div><div className="channel-id">CHANNEL <strong>default</strong></div><nav><button className={view === 'control' ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate('control')}><span>◫</span> Control</button><button className={view === 'analytics' ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate('analytics')}><span>◒</span> Analytics</button></nav></div><StreamStatus isOn={isOn} profileCount={profileCount} lastError={lastError} /></aside><div className="workspace"><header className="topbar"><div><p className="eyebrow">BROADCAST OPERATIONS / {view.toUpperCase()}</p><h1>{view === 'control' ? 'Channel' : 'Analytics'}</h1><p className="subtitle">{view === 'control' ? 'Configure overlay placement and manage the live output.' : 'Viewer and insertion telemetry for the default channel.'}</p></div>{view === 'analytics' && <span className="refresh-note">Refreshes every 5s <span className="refresh-dot" /> </span>}</header>{children}</div></div>
}

export function StreamStatus({ isOn, profileCount, lastError }: { isOn: boolean; profileCount: number; lastError?: string }) { return <div className="rail-status"><div className="status-row"><span className={isOn ? 'status-pill on' : 'status-pill off'}><span className="status-dot" /> {isOn ? 'ON' : 'OFF'}</span><span className="profile-count">{profileCount} profiles</span></div>{lastError && <p className="error-copy">{lastError}</p>}</div> }

export function CreativeCatalog({ ads, selectedId, filter, onFilter, onSelect }: { ads: Ad[]; selectedId: string; filter: 'all' | Category; onFilter: (filter: 'all' | Category) => void; onSelect: (ad: Ad) => void }) { const filtered = ads.filter(ad => filter === 'all' || ad.category === filter); return <section className="catalog panel"><div className="section-heading"><div><p className="eyebrow">LIBRARY</p><h2>Creatives</h2></div><span className="muted">{filtered.length} assets</span></div><div className="filter-row">{(['all', 'l-shape', 'bottom-banner'] as const).map(item => <button key={item} className={filter === item ? 'chip selected' : 'chip'} onClick={() => onFilter(item)}>{item === 'all' ? 'All' : item === 'l-shape' ? 'L-shape' : 'Bottom banner'}</button>)}</div><div className="creative-list">{filtered.map(ad => <button key={ad.id} className={selectedId === ad.id ? 'creative-card selected' : 'creative-card'} onClick={() => onSelect(ad)}><img src={ad.imageUrl} alt="Overlay creative preview" /><div className="creative-info"><strong>{ad.name}</strong><span>{ad.category === 'l-shape' ? 'L-shape' : 'Bottom banner'}</span></div></button>)}</div></section> }

export function ProgramPreview({ ad, overlay, onChange }: { ad: Ad | null; overlay: Overlay; onChange: (overlay: Overlay) => void }) { const style: CSSProperties = { left: `${overlay.xPct}%`, top: `${overlay.yPct}%`, width: `${overlay.widthPct}%`, height: `${overlay.heightPct}%` }; const move = (direction: 'left' | 'right' | 'up' | 'down') => { const next = { ...overlay }; if (direction === 'left') next.xPct -= 1; if (direction === 'right') next.xPct += 1; if (direction === 'up') next.yPct -= 1; if (direction === 'down') next.yPct += 1; onChange({ ...next, xPct: Math.max(0, Math.min(100 - next.widthPct, next.xPct)), yPct: Math.max(0, Math.min(100 - next.heightPct, next.yPct)) }) }; return <div><div className="program-frame"><div className="hatch"><span>Live video</span><small>16:9 PROGRAM FEED</small></div>{ad && <button className="overlay-box" style={style} onClick={() => move('right')} aria-label="Selected creative. Click to nudge right"><img src={ad.imageUrl} alt="Selected creative" /><span>{ad.name}</span><i /></button>}</div><div className="readouts">{(['xPct', 'yPct', 'widthPct', 'heightPct'] as const).map((key, index) => <div key={key}><span>{['X', 'Y', 'W', 'H'][index]}</span><strong>{overlay[key].toFixed(1)}%</strong></div>)}</div><p className="hint">Select the creative to edit its placement. Click the overlay to nudge it.</p></div> }

export function ChannelInspector({ url, duration, transition, isOn, busy, hasAd, onUrlChange, onDurationChange, onTransitionChange, onToggle, onSave, onInsert }: { url: string; duration: number; transition: number; isOn: boolean; busy: boolean; hasAd: boolean; onUrlChange: (value: string) => void; onDurationChange: (value: number) => void; onTransitionChange: (value: number) => void; onToggle: () => void; onSave: () => void; onInsert: () => void }) { return <section className="inspector panel"><div className="inspector-head"><div><p className="eyebrow">CHANNEL CONFIGURATION</p><h2>Inspector</h2></div><button className={isOn ? 'button danger' : 'button primary'} onClick={onToggle} disabled={busy}>{busy && <span className="spinner" />}{isOn ? 'Turn off' : 'Turn on'}</button></div><div className="inspector-status"><span className={isOn ? 'status-pill on' : 'status-pill off'}><span className="status-dot" /> {isOn ? 'ON' : 'OFF'}</span><span>{isOn ? 'Output is live' : 'Output is stopped'}</span></div><label>HLS input URL<input value={url} onChange={e => onUrlChange(e.target.value)} disabled={isOn} /><small>Locked while the channel is live.</small></label><div className="field-grid"><label>Insertion duration<input type="number" min="1" value={duration} onChange={e => onDurationChange(Number(e.target.value))} /><small>seconds</small></label><label>Transition duration<input type="number" min="0" step="0.1" value={transition} onChange={e => onTransitionChange(Number(e.target.value))} /><small>seconds</small></label></div><div className="inspector-actions"><button className="button secondary" onClick={onSave} disabled={busy}>Save configuration</button><button className="button amber" onClick={onInsert} disabled={busy || !isOn || !hasAd}>Insert ad now</button></div>{!isOn && <p className="hint">Turn the channel on to insert.</p>}</section> }

export function AnalyticsView() {
  const stats = [['Active sessions', '0', 'seen in the last 2 min'], ['Unique sessions', '1', 'all recorded viewers'], ['Ad views', '2', 'heartbeat events'], ['Insertions', '2', 'distinct overlay breaks'], ['Ad time delivered', '24s', 'sum of viewed durations']]
  return <div className="analytics-view"><div className="stat-grid">{stats.map(([label, value, hint]) => <StatCard key={label} label={label} value={value} hint={hint} />)}</div><div className="chart-grid"><ChartPanel title="Sessions by device"><PieChart data={[{ label: 'Linux', count: 1 }]} /></ChartPanel><ChartPanel title="Views by category"><PieChart data={[{ label: 'Bottom banner', count: 2 }]} /></ChartPanel><ChartPanel title="Views and duration by ad"><BarChart data={[{ label: 'bottom-banner-ottoman', count: 2, detail: '24s' }]} /></ChartPanel><ChartPanel title="Sessions over time"><LineChart data={[{ start: '09:00', count: 1 }]} /></ChartPanel><ChartPanel title="Ad views over time"><LineChart data={[{ start: '08:50', count: 1 }, { start: '08:55', count: 0 }, { start: '09:00', count: 0 }, { start: '09:05', count: 1 }]} /></ChartPanel></div><DataTable title="Active sessions" headers={['Session', 'Device', 'Profile', 'Last seen']} empty="No viewer has hit the manifest in the last 2 minutes." /><DataTable title="Recent ad views" headers={['When', 'Ad', 'Category', 'Duration', 'Device', 'Session']} rows={[['Nov 1, 09:05 AM', 'bottom-banner-ottoman', 'Bottom banner', '12s', 'Linux', '95e88e79'], ['Nov 1, 08:54 AM', 'bottom-banner-ottoman', 'Bottom banner', '12s', 'Linux', 'c17debaf']]} /></div>
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) { return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article> }
function ChartPanel({ title, children }: { title: string; children: ReactNode }) { return <section className="chart-panel"><h3>{title}</h3>{children}</section> }
export function PieChart({ data }: { data: Slice[] }) { if (!data.length) return <EmptyChart />; return <div className="pie-wrap"><div className="pie" style={{ '--pie': `${(data[0].count / data.reduce((sum, item) => sum + item.count, 0)) * 360}deg` } as CSSProperties} /><div className="legend">{data.map(item => <span key={item.label}><i />{item.label}<b>{item.count}</b></span>)}</div></div> }
export function BarChart({ data }: { data: { label: string; count: number; detail: string }[] }) { if (!data.length) return <EmptyChart />; return <div className="bar-list">{data.map(item => <div className="bar-row" key={item.label}><div><span>{item.label}</span><b>{item.count} views · {item.detail}</b></div><div className="bar-track"><i style={{ width: `${Math.max(10, item.count * 35)}%` }} /></div></div>)}</div> }
export function LineChart({ data }: { data: Point[] }) { if (!data.length) return <EmptyChart />; const max = Math.max(...data.map(item => item.count), 1); const points = data.map((item, index) => `${(index / Math.max(data.length - 1, 1)) * 100},${82 - (item.count / max) * 58}`).join(' '); return <div className="line-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Line chart"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />{data.map((item, index) => <circle key={item.start} cx={(index / Math.max(data.length - 1, 1)) * 100} cy={82 - (item.count / max) * 58} r="2.4" fill="currentColor" vectorEffect="non-scaling-stroke" />)}</svg><div className="axis-labels">{data.map(item => <span key={item.start}>{item.start}</span>)}</div></div> }
function EmptyChart() { return <div className="empty-chart">No data yet.</div> }
function DataTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows?: string[][]; empty?: string }) { return <section className="table-panel"><h3>{title}</h3>{rows ? <div className="table-scroll"><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.join('-')}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}</tr>)}</tbody></table></div> : <div className="table-empty">{empty}</div>}</section> }
