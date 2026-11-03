import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AnalyticsCount, AnalyticsReport, AnalyticsTimeline } from '../types';

const PIE_COLORS = ['#7c5cbf', '#2a9d8f', '#e9c46a', '#e76f51', '#457b9d', '#f4a261'];

export function AnalyticsDashboard() {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getAnalytics();
        if (!cancelled) {
          setReport(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!report && error) {
    return <div style={{ color: '#e74c3c' }}>{error}</div>;
  }
  if (!report) {
    return <div>Loading analytics…</div>;
  }

  const windowMin = Math.round(report.activeWindowMs / 60000);

  return (
    <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 20, color: 'var(--text-h)' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat label="Active sessions" value={String(report.sessions.activeCount)} hint={`seen in the last ${windowMin} min`} />
        <Stat label="Unique sessions" value={String(report.sessions.uniqueCount)} hint="all recorded viewers" />
        <Stat label="Ad views" value={String(report.insertions.viewCount)} hint="heartbeat events" />
        <Stat label="Insertions" value={String(report.insertions.uniqueCount)} hint="distinct overlay breaks" />
        <Stat label="Ad time delivered" value={formatDuration(report.insertions.totalDurationSec)} hint="sum of viewed durations" />
      </div>
      {error && <div style={{ color: '#e74c3c' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel title="Sessions by device">
          <PieChart slices={report.sessions.byDevice} />
        </Panel>
        <Panel title="Views by category">
          <PieChart slices={report.insertions.byCategory} />
        </Panel>
        <Panel title="Views and duration by ad">
          <BarChart
            rows={report.insertions.byAd.map((ad) => ({
              label: ad.adId,
              count: ad.views,
              detail: formatDuration(ad.durationSec),
            }))}
          />
        </Panel>
        <Panel title="Sessions over time">
          <LineChart timeline={report.sessions.timeline} />
        </Panel>
        <Panel title="Ad views over time">
          <LineChart timeline={report.insertions.timeline} />
        </Panel>
      </div>

      <Panel title="Active sessions">
        {report.sessions.active.length === 0 ? (
          <Empty>No viewer has hit the manifest in the last {windowMin} minutes.</Empty>
        ) : (
          <table className="analytics-table" style={tableStyle}>
            <thead>
              <tr>
                <th>Session</th>
                <th>Device</th>
                <th>Profile</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.active.map((session) => (
                <tr key={session.sessionId}>
                  <td title={session.sessionId}>{session.sessionId.slice(0, 8)}</td>
                  <td>{session.device}</td>
                  <td>{session.profileId ?? '—'}</td>
                  <td>{formatAgo(report.generatedAt - session.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Recent ad views">
        {report.insertions.recent.length === 0 ? (
          <Empty>No insertion heartbeats yet.</Empty>
        ) : (
          <table className="analytics-table" style={tableStyle}>
            <thead>
              <tr>
                <th>When</th>
                <th>Ad</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Device</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {report.insertions.recent.map((event) => (
                <tr key={`${event.insertionId}:${event.sessionId}:${event.timestamp}`}>
                  <td>{formatClock(event.timestamp)}</td>
                  <td>{event.adId}</td>
                  <td>{labelFor(event.category)}</td>
                  <td>{formatDuration(event.durationSec)}</td>
                  <td>{event.device}</td>
                  <td title={event.sessionId}>{event.sessionId.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ ...cardStyle, minWidth: 140, flex: '1 1 140px' }}>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, margin: '4px 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text)' }}>{hint}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={cardStyle}>
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ color: 'var(--text)', fontSize: 14 }}>{children}</div>;
}

function PieChart({ slices }: { slices: AnalyticsCount[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  if (total === 0) return <Empty>No data yet.</Empty>;

  const r = 72;
  const cx = 90;
  const cy = 90;
  let angle = -Math.PI / 2;
  const paths = slices.map((slice, index) => {
    const sweep = (slice.count / total) * Math.PI * 2;
    if (slices.length === 1 || sweep >= Math.PI * 2 - 0.0001) {
      return <circle key={slice.label} cx={cx} cy={cy} r={r} fill={PIE_COLORS[index % PIE_COLORS.length]} />;
    }
    const start = angle;
    angle += sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return <path key={slice.label} d={d} fill={PIE_COLORS[index % PIE_COLORS.length]} />;
  });

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Pie chart">
        {paths}
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14 }}>
        {slices.map((slice, index) => (
          <li key={slice.label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[index % PIE_COLORS.length] }} />
            <span>{labelFor(slice.label)}</span>
            <span style={{ color: 'var(--text)' }}>{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarChart({ rows }: { rows: { label: string; count: number; detail?: string }[] }) {
  if (rows.length === 0) return <Empty>No data yet.</Empty>;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <span>{row.label}</span>
            <span style={{ color: 'var(--text)' }}>{row.count}{row.detail ? ` · ${row.detail}` : ''}</span>
          </div>
          <div style={{ background: 'var(--bg)', borderRadius: 4, height: 14 }}>
            <div style={{ width: `${(row.count / max) * 100}%`, minWidth: 4, height: '100%', borderRadius: 4, background: '#7c5cbf' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ timeline }: { timeline: AnalyticsTimeline }) {
  const points = timeline.points;
  if (points.length === 0) return <Empty>No data yet.</Empty>;
  const width = 320;
  const height = 140;
  const pad = 16;
  const max = Math.max(...points.map((point) => point.count), 1);
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - (point.count / max) * (height - pad * 2);
    return { x, y, point };
  });
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart">
        <polyline fill="none" stroke="#2a9d8f" strokeWidth="2" points={coords.map((coord) => `${coord.x},${coord.y}`).join(' ')} />
        {coords.map((coord) => (
          <circle key={coord.point.start} cx={coord.x} cy={coord.y} r="3" fill="#2a9d8f" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text)' }}>
        <span>{bucketLabel(first.start, timeline.bucketMs)}</span>
        <span>{bucketLabel(last.start, timeline.bucketMs)}</span>
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--code-bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

function labelFor(value: string): string {
  if (value === 'l-shape') return 'L-shape';
  if (value === 'bottom-banner') return 'Bottom banner';
  if (value === 'unknown') return 'Unknown';
  return value;
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function formatAgo(deltaMs: number): string {
  const seconds = Math.max(0, Math.round(deltaMs / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function bucketLabel(start: number, bucketMs: number): string {
  const date = new Date(start);
  if (bucketMs >= 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
