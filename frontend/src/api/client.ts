import type { AdCreative, AnalyticsReport, StreamConfig, StreamStatusResponse } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getAds: () => request<AdCreative[]>('/api/ads'),
  getConfig: () => request<StreamConfig>('/api/config'),
  saveConfig: (patch: Partial<StreamConfig>) =>
    request<StreamConfig>('/api/config', { method: 'POST', body: JSON.stringify(patch) }),
  streamOn: () => request<StreamStatusResponse>('/api/stream/on', { method: 'POST' }),
  streamOff: () => request<StreamStatusResponse>('/api/stream/off', { method: 'POST' }),
  streamStatus: () => request<StreamStatusResponse>('/api/stream/status'),
  insert: (body: { adId: string; durationSec: number; xPct: number; yPct: number; widthPct: number; heightPct: number }) =>
    request<unknown>('/api/insert', { method: 'POST', body: JSON.stringify(body) }),
  getAnalytics: () => request<AnalyticsReport>('/api/analytics'),
};
