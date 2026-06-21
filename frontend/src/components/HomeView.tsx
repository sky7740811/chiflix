import { useState, useEffect } from 'react';

interface HomeViewProps {
  onPlayLocal: (title: string, epNum: number) => void;
}

export default function HomeView({ onPlayLocal }: HomeViewProps) {
  const [latest, setLatest] = useState<{ title: string; ep: number; time: number; total?: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await (await fetch('/api/watchlist')).json();
        const wl = r.watchlist || {};
        let best: { title: string; ep: number; time: number; total?: number } | null = null;
        for (const [title, data] of Object.entries(wl) as any) {
          const eps = data.episodes || {};
          const keys = Object.keys(eps).map(Number).filter(n => n > 0);
          if (keys.length === 0) continue;
          const lastEp = Math.max(...keys);
          const epData = eps[String(lastEp)];
          if (!best || lastEp > best.ep) {
            best = { title, ep: lastEp, time: epData.time_ms || 0, total: epData.total_ms };
          }
        }
        setLatest(best);
      } catch {}
    })();
  }, []);

  if (!latest) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: '18px', marginBottom: '12px' }}>Welcome to Chiflix Pro</div>
        <p style={{ color: '#888', lineHeight: 1.6 }}>
          Search anime in the navbar above, or go to the <strong>Search</strong> tab.<br />
          Click an episode to start watching.
        </p>
      </div>
    );
  }

  const s = Math.floor((latest.time || 0) / 1000);
  const pct = latest.total ? Math.min(100, (latest.time / latest.total) * 100) : 0;

  return (
    <div style={{ padding: '30px 60px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px' }}>Continue Watching</h1>
      <div className="progress-item" onClick={() => onPlayLocal(latest.title, latest.ep)}
        style={{ cursor: 'pointer', background: '#1f1f1f', borderRadius: '8px', padding: '16px', maxWidth: '500px' }}>
        <div className="progress-thumb" style={{ background: '#2a2a3e', width: '100px', height: '60px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ▶
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>{latest.title}</div>
          <div style={{ color: '#999', fontSize: '13px', marginTop: '2px' }}>Episode {latest.ep}</div>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>Resume at {Math.floor(s/60)}:{String(s%60).padStart(2,'0')}</div>
          {pct > 0 && (
            <div className="progress-bar" style={{ marginTop: '8px' }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
