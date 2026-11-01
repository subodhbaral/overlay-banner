import { useEffect, useState } from 'react';
import { api } from './api/client';
import type { AdCreative, StreamConfig, StreamStatusResponse } from './types';
import { AdsCatalogList } from './components/AdsCatalogList';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { OverlayPreviewCanvas } from './components/OverlayPreviewCanvas';
import { StreamConfigForm } from './components/StreamConfigForm';
import { StreamToggle } from './components/StreamToggle';

export default function App() {
  const [ads, setAds] = useState<AdCreative[]>([]);
  const [config, setConfig] = useState<StreamConfig | null>(null);
  const [status, setStatus] = useState<StreamStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertMsg, setInsertMsg] = useState<string | null>(null);
  const [view, setView] = useState<'control' | 'analytics'>('control');

  useEffect(() => {
    api.getAds().then(setAds).catch((e) => setError(String(e)));
    api.getConfig().then(setConfig).catch((e) => setError(String(e)));
    api.streamStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      api.streamStatus().then(setStatus).catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, []);

  if (!config) {
    return <div style={{ padding: 24, color: '#eee' }}>Loading…</div>;
  }

  const selectedAd = ads.find((a) => a.id === config.overlay.adId) ?? null;
  const isOn = status?.status === 'ON';

  function patchConfig(patch: Partial<StreamConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
  }
  function patchOverlay(patch: Partial<StreamConfig['overlay']>) {
    setConfig((c) => (c ? { ...c, overlay: { ...c.overlay, ...patch } } : c));
  }

  async function handleSelectAd(ad: AdCreative) {
    patchOverlay({
      adId: ad.id,
      xPct: ad.defaultXPct,
      yPct: ad.defaultYPct,
      widthPct: ad.defaultWidthPct,
      heightPct: ad.defaultHeightPct,
    });
  }

  async function handleSave() {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveConfig(config);
      setConfig(saved);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle() {
    setBusy(true);
    setError(null);
    try {
      const next = isOn ? await api.streamOff() : await api.streamOn();
      setStatus(next);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleInsertNow() {
    if (!config) return;
    setBusy(true);
    setInsertMsg(null);
    setError(null);
    try {
      await api.insert({
        adId: config.overlay.adId,
        durationSec: config.overlay.insertionDurationSec,
        xPct: config.overlay.xPct,
        yPct: config.overlay.yPct,
        widthPct: config.overlay.widthPct,
        heightPct: config.overlay.heightPct,
      });
      setInsertMsg('Insertion job queued for transcoding.');
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, color: '#eee', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ margin: 0 }}>HLS Ad Overlay</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setView('control')} disabled={view === 'control'}>
          Control panel
        </button>
        <button type="button" onClick={() => setView('analytics')} disabled={view === 'analytics'}>
          Analytics
        </button>
      </div>

      {view === 'analytics' ? (
        <AnalyticsDashboard />
      ) : (
        <>
      <StreamToggle status={status} onToggle={handleToggle} busy={busy} />

      {error && <div style={{ color: '#e74c3c' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div>
          <h3>1. Choose an ad</h3>
          <AdsCatalogList ads={ads} selectedId={config.overlay.adId} onSelect={handleSelectAd} />
        </div>

        <div>
          <h3>2. Position &amp; size (drag / resize)</h3>
          <OverlayPreviewCanvas
            ad={selectedAd}
            overlay={config.overlay}
            onChange={(patch) => patchOverlay(patch)}
          />
        </div>

        <div>
          <h3>3. Stream configuration</h3>
          <StreamConfigForm
            config={config}
            onChange={patchConfig}
            onOverlayFieldChange={patchOverlay}
            disabled={isOn}
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={handleSave} disabled={busy}>
              Save configuration
            </button>
            <button onClick={handleInsertNow} disabled={busy || !isOn || !config.overlay.adId}>
              Insert ad now
            </button>
          </div>
          {insertMsg && <div style={{ color: '#2ecc71', marginTop: 8 }}>{insertMsg}</div>}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
