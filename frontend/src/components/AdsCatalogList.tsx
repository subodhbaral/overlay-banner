import { useState } from 'react';
import type { AdCategory, AdCreative } from '../types';

interface Props {
  ads: AdCreative[];
  selectedId: string;
  onSelect: (ad: AdCreative) => void;
}

const CATEGORIES: { id: AdCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'l-shape', label: 'L-Shape' },
  { id: 'bottom-banner', label: 'Bottom Banner' },
];

export function AdsCatalogList({ ads, selectedId, onSelect }: Props) {
  const [category, setCategory] = useState<AdCategory | 'all'>('all');
  const filtered = category === 'all' ? ads : ads.filter((a) => a.category === category);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid #444',
              background: category === c.id ? '#4da3ff' : 'transparent',
              color: category === c.id ? '#111' : '#ddd',
              cursor: 'pointer',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {filtered.map((ad) => (
          <div
            key={ad.id}
            onClick={() => onSelect(ad)}
            style={{
              cursor: 'pointer',
              border: ad.id === selectedId ? '2px solid #4da3ff' : '1px solid #333',
              borderRadius: 6,
              overflow: 'hidden',
              background: '#1b1f27',
            }}
          >
            <img src={ad.imageUrl} alt={ad.name} style={{ width: '100%', height: 80, objectFit: 'cover' }} />
            <div style={{ padding: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{ad.name}</div>
              <div style={{ color: '#888' }}>{ad.category}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
