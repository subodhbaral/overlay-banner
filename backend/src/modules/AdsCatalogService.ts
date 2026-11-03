import { ADS_CATALOG_FILE } from '../utils/paths.js';
import { readJsonIfExists } from '../utils/atomicFile.js';
import type { AdCreative } from '../types/index.js';

/**
 * Reads the static ad catalog (JSON + images under /ADS). Images are served
 * by the server at /ads-catalog/images/:fileName (see routes/adsCatalog.ts).
 */
export class AdsCatalogService {
  private cache: AdCreative[] | null = null;

  async list(): Promise<AdCreative[]> {
    if (this.cache) return this.cache;
    const items = await readJsonIfExists<AdCreative[]>(ADS_CATALOG_FILE);
    this.cache = items ?? [];
    return this.cache;
  }

  async getById(id: string): Promise<AdCreative | undefined> {
    const items = await this.list();
    return items.find((a) => a.id === id);
  }
}

export const adsCatalogService = new AdsCatalogService();
