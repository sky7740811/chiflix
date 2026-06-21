import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { LocalFile, WatchlistItem } from '../types';

interface PlaylistViewProps {
  onPlayLocal: (animeTitle: string, epNum: number, episodeHref?: string, filePath?: string) => void;
}

export default function PlaylistView({ onPlayLocal }: PlaylistViewProps) {
  const [tab, setTab] = useState<'watchlist' | 'downloads'>('watchlist');
  const [dirs, setDirs] = useState<Record<string, LocalFile[]>>({});
  const [selDir, setSelDir] = useState<string | null>(null);
  const [selFiles, setSelFiles] = useState<LocalFile[]>([]);
  const [watchlist, setWatchlist] = useState<Record<string, WatchlistItem>>({});
  const [selWl, setSelWl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { const f = await api.getLocalFiles(); setDirs(f || {}); } catch { setDirs({}); }
    try { const w = await api.getWatchlist(); setWatchlist(w || {}); } catch { setWatchlist({}); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (selDir && dirs[selDir]) setSelFiles(dirs[selDir]);
    else setSelFiles([]);
  }, [selDir, dirs]);

  const deleteFile = useCallback(async (f: LocalFile) => {
    if (!confirm(`"${f.filename}" 파일을 삭제하시겠습니까?`)) return;
    try { await api.deleteLocalFile(f.path); await refresh(); } catch { alert('삭제 실패'); }
  }, [refresh]);

  const wlItems = Object.entries(watchlist);
  const dlItems = Object.entries(dirs);

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="mylist-header">
        <h1>내 리스트</h1>
        <p>당신의 애니메이션 컬렉션 및 진행 상황</p>
        <div className="tab-switch">
          <button className={tab === 'watchlist' ? 'active' : ''} onClick={() => setTab('watchlist')}>찜 목록</button>
          <button className={tab === 'downloads' ? 'active' : ''} onClick={() => { setTab('downloads'); if (!selDir && dlItems.length > 0) setSelDir(dlItems[0][0]); }}>다운로드</button>
        </div>
      </div>

      {tab === 'watchlist' && (
        <div className="mylist-layout">
          <div className="mylist-sidebar">
            <div className="list-section-label">시청 중인 작품</div>
            {wlItems.length === 0 && (
              <div className="list-card" style={{ cursor: 'default', opacity: .5 }}>
                <div className="list-card-thumb" style={{ background: '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>♡</div>
                <div className="list-card-info">
                  <div className="list-card-title" style={{ fontWeight: 400 }}>아직 없음</div>
                  <div className="list-card-sub">플레이어에서 찜하기</div>
                </div>
              </div>
            )}
            {wlItems.map(([title], i) => (
              <div key={title} className={`list-card${selWl === title ? ' active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, cursor: 'pointer' }}
                  onClick={() => setSelWl(title)}>
                  <div className="list-card-thumb" style={{ background: ['#2a2a3e','#1a1a2e','#2e1a2e','#1a2e1a'][i%4], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>♡</div>
                  <div className="list-card-info">
                    <div className="list-card-title">{title}</div>
                  </div>
                </div>
                <button onClick={async () => {
                  if (!confirm(`Remove "${title}" from watchlist?`)) return;
                  try { await api.removeFromWatchlist(title); refresh(); if (selWl === title) setSelWl(null); } catch { alert('Failed'); }
                }} title="삭제" style={{
                  background: 'none', border: 'none', cursor: 'pointer', opacity: .35, padding: '4px',
                  transition: 'opacity .15s', flexShrink: 0, color: '#fff', fontSize: '16px',
                }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '.35'}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mylist-main">
            <div className="list-section-label">시청 기록</div>
            {selWl && watchlist[selWl] ? (
              Object.entries(watchlist[selWl].episodes || {}).sort(([a],[b]) => parseInt(a)-parseInt(b)).map(([ep, data]) => {
                const s = Math.floor((data.time_ms || 0) / 1000);
                const pct = data.total_ms ? Math.min(100, (data.time_ms / data.total_ms) * 100) : 0;
                return (
                  <div key={ep} className="progress-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', minWidth: 0 }} onClick={() => onPlayLocal(selWl, parseInt(ep))}>
                      <div className="progress-thumb" style={{ background: '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▶</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{ep}화</div>
                        <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{Math.floor(s/60)}분 {String(s%60).padStart(2,'0')}초</div>
                        {pct > 0 && <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>}
                      </div>
                    </div>
                    <button onClick={async (e) => { e.stopPropagation(); if (!confirm(`시청 기록을 삭제${ep}?`)) return; try { await fetch(`/api/progress/delete?anime_title=${encodeURIComponent(selWl)}&ep_num=${ep}`, { method: 'POST' }); refresh(); } catch { alert('Failed'); } }} title="삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: .35, padding: '4px', transition: 'opacity .15s', flexShrink: 0, color: '#fff', fontSize: '14px' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '.35'}>✕</button>
                    </div>
                  );
                })
              ) : (
              <div className="progress-item" style={{ cursor: 'default', opacity: .5 }}>
                <div className="progress-thumb" style={{ background: '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>⊡</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 400, fontSize: '14px', color: '#888' }}>{wlItems.length > 0 ? '시리즈 선택' : '기록 없음'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'downloads' && (
        <div className="mylist-layout">
          <div className="mylist-sidebar">
            <div className="list-section-label">작품 목록</div>
            {dlItems.length === 0 && (
              <div className="list-card" style={{ cursor: 'default', opacity: .5 }}>
                <div className="list-card-thumb" style={{ background: '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📁</div>
                <div className="list-card-info">
                  <div className="list-card-title" style={{ fontWeight: 400 }}>다운로드 없음</div>
                  <div className="list-card-sub">플레이어에서 다운로드</div>
                </div>
              </div>
            )}
            {dlItems.map(([dir]) => (
              <div key={dir} className={`list-card${selDir === dir ? ' active' : ''}`} onClick={() => setSelDir(dir)}>
                <div className="list-card-thumb" style={{ background: '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📁</div>
                <div className="list-card-info">
                  <div className="list-card-title">{dir}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div className="list-section-label">에피소드</div>
            {selFiles.length === 0 && (
              <div className="progress-item" style={{ cursor: 'default', opacity: .5 }}>
                <div className="progress-thumb" style={{ background: '#2a2a3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>⊡</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 400, fontSize: '14px', color: '#888' }}>{dlItems.length > 0 ? '시리즈 선택' : '파일 없음'}</div>
                </div>
              </div>
            )}
            {selFiles.map((f, i) => (
              <div key={i} className="progress-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px' }}>
                <div className="progress-thumb" style={{ background: '#2a2a3e', width: '50px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📁</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.filename.replace('.mp4', '')}</div>
                  <div style={{ color: '#888', fontSize: '12px' }}>로컬 파일</div>
                </div>
                <button onClick={() => deleteFile(f)} title="삭제" style={{
                  background: 'none', border: 'none', cursor: 'pointer', opacity: .4, padding: '6px', flexShrink: 0,
                  transition: 'opacity .15s', borderRadius: '4px',
                }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '.4'}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="status-text">
        <button className="section-link" style={{ color: '#e50914', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }} onClick={refresh}>
          ↻ 새로고침
        </button>
      </div>
    </div>
  );
}
