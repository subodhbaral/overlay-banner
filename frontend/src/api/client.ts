import type { AdCreative, AnalyticsReport, StreamConfig, StreamStatusResponse } from '../types';

/** Backend origin from frontend/.env (`API_URL`). Empty falls back to same-origin paths. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.API_URL ?? '').replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
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
  getAds: async () => {
    const ads = await request<AdCreative[]>('/api/ads');
    return ads.map((ad) => ({
      ...ad,
      imageUrl: ad.imageUrl.startsWith('http') ? ad.imageUrl : apiUrl(ad.imageUrl),
    }));
  },
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
