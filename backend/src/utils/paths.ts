import path from 'node:path';
import { fileURLToPath } from 'node:url';

// backend/src/utils -> backend/src -> backend -> project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
export const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const AD_SEGMENTS_DIR = path.join(DATA_DIR, 'ad-segments');
export const SEGMENT_CACHE_DIR = path.join(DATA_DIR, 'segment-cache');
export const ANALYTICS_DIR = path.join(DATA_DIR, 'analytics');
export const ANALYTICS_LOG_FILE = path.join(ANALYTICS_DIR, 'heartbeats.jsonl');
export const SESSIONS_LOG_FILE = path.join(ANALYTICS_DIR, 'sessions.jsonl');
export const ADS_CATALOG_FILE = path.join(DATA_DIR, 'ads-catalog.json');
export const ADS_IMAGES_DIR = path.join(PROJECT_ROOT, 'ADS');
