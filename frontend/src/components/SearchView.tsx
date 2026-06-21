import { useState, useCallback, useEffect } from 'react';
import type { SearchResult, EpisodeItem } from '../types';
import * as api from '../api';

interface SearchViewProps {
  initialQuery?: string;
  onPlayEpisode: (animeTitle: string, epNum: number, episodeHref: string) => void;
}

const CACHE_KEY = 'chiflix_search';

function loadCache(): { query: string; results: SearchResult[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCache(query: string, results: SearchResult[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ query, results })); } catch {}
}

export default function SearchView({ initialQuery = '', onPlayEpisode }: SearchViewProps) {
  const [query, setQuery] = useState(() => {
    const cached = loadCache();
    return cached?.query || initialQuery;
  });
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>(() => {
    const cached = loadCache();
    return cached?.results || [];
  });
  const [selectedSeries, setSelectedSeries] = useState<SearchResult | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  const [status, setStatus] = useState('');

  /* Check for pending navbar search on mount */
  useEffect(() => {
    const navQ = (() => { try { return localStorage.getItem('chiflix_nav_search'); } catch { return null; } })();
    if (navQ) {
      try { localStorage.removeItem('chiflix_nav_search'); } catch {}
      setQuery(navQ);
      handleSearch(navQ);
    } else if (results.length > 0 && !initialQuery) {
      setStatus(`캐시에서 ${results.length}개 불러옴`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async (q?: string) => {
    const searchQ = (q || query).trim();
    if (!searchQ) return;
    setSearching(true);
    setSelectedSeries(null);
    setEpisodes([]);
    setStatus('검색 중...');
    try {
      const data = await api.searchAnime(searchQ);
      const sorted = [...data].sort((a, b) => {
        if (a.date_str && b.date_str) return b.date_str.localeCompare(a.date_str);
        return 0;
      });
      setResults(sorted);
      saveCache(searchQ, sorted);
      setStatus(data.length ? `${data.length}개 결과 발견` : '검색 결과가 없습니다');
    } catch (err: unknown) {
      setStatus(`Error: ${err instanceof Error ? err.message : '검색 실패'}`);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelectSeries = useCallback(async (item: SearchResult) => {
    setSelectedSeries(item);
    setLoadingEps(true);
    setStatus(`Loading episodes...`);
      try {
        const eps = await api.getEpisodes(item.href);
        setEpisodes(eps);
        setStatus(`${eps.length}개 에피소드 불러옴`);
        try {
          await fetch(`/api/anime-cache?anime_title=${encodeURIComponent(item.text)}&series_url=${encodeURIComponent(item.href)}`, { method: 'POST' });
          if (item.img_src) {
            await fetch(`/api/anime-cache/img?anime_title=${encodeURIComponent(item.text)}&img_src=${encodeURIComponent(item.img_src)}`, { method: 'POST' });
          }
        } catch {}
      } catch (err: unknown) {
      setEpisodes([]);
      setStatus(`Error: ${err instanceof Error ? err.message : '실패'}`);
    } finally {
      setLoadingEps(false);
    }
  }, []);

  const handleEpisodeClick = useCallback((ep: EpisodeItem) => {
    if (selectedSeries) onPlayEpisode(selectedSeries.text, ep.ep_num, ep.href);
  }, [selectedSeries, onPlayEpisode]);

  return (
    <>
      <div className="search-header">
        <h1>검색</h1>
        <div className="search-input-wrap">
          <span style={{ color: '#999', marginRight: '12px', fontSize: '18px' }}>🔍</span>
          <input
            type="text"
            placeholder="제목, 장르 또는 키워드 입력..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>

      {!selectedSeries && results.length > 0 && (
        <div className="view-grid">
          {results.map((item, i) => (
            <div className="card" key={i} onClick={() => handleSelectSeries(item)} title={item.text}>
              {item.img_src ? (
                <div className="card-img"><img src={item.img_src} alt="" loading="lazy" /></div>
              ) : (
                <div className="card-img" style={{ background: ['#2a2a3e','#1a1a2e','#2e1a2e','#1a2e1a'][i % 4] }}>🎬</div>
              )}
              <div className="card-footer">
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#ddd', lineHeight: 1.2 }}>{item.text}</div>
                {item.date_str && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{item.date_str}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {!selectedSeries && results.length === 0 && !searching && (
        <div className="view-grid">
          <div className="view-grid-empty">
            {status || '위에서 검색해보세요'}
          </div>
        </div>
      )}

      {selectedSeries && (
        <div style={{ padding: '0 60px 40px' }}>
          <div className="tab-bar" style={{ padding: '16px 0', marginBottom: '16px' }}>
            <button className="tab-item" onClick={() => setSelectedSeries(null)}>← 결과로 돌아가기</button>
            <button className="tab-item active">{selectedSeries.text}</button>
          </div>
          {loadingEps && <div className="empty-state" style={{ padding: '20px' }}>Loading episodes...</div>}
          {!loadingEps && episodes.length === 0 && (
            <div className="empty-state" style={{ padding: '20px' }}>에피소드가 없습니다</div>
          )}
          {episodes.map((ep, i) => (
            <div key={i} className="episode-item" onClick={() => handleEpisodeClick(ep)}>
              <div className="episode-thumb"><span>{ep.ep_num}화</span></div>
              <div className="episode-info">
                <div className="episode-title">{ep.text}</div>
                <div className="episode-meta">{ep.ep_num}화</div>
                <div className="episode-desc">클릭하여 시청</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="status-text">{searching ? '검색 중...' : status}</div>
    </>
  );
}
