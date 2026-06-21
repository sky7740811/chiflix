import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import HomeView from './components/HomeView';
import SearchView from './components/SearchView';
import PlayerView from './components/PlayerView';
import PlaylistView from './components/PlaylistView';
import './App.css';

interface PlayContext {
  animeTitle: string;
  epNum: number;
  episodeHref: string;
  filePath?: string;
}

const LS_KEY = 'chiflix_state';

function loadState(): { path: string; ctx: PlayContext | null } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { path: '/', ctx: null };
}

function saveState(path: string, ctx: PlayContext | null) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ path, ctx })); } catch {}
}

const NAV_ITEMS = [
  { path: '/', label: '홈' },
  { path: '/search', label: '검색' },
  { path: '/player', label: '플레이어' },
  { path: '/mylist', label: '내 리스트' },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [playContext, setPlayContext] = useState<PlayContext | null>(() => loadState().ctx);
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchVal, setNavSearchVal] = useState('');
  const [scrolled, setScrolled] = useState(false);

  /* Restore last view on mount */
  useEffect(() => {
    const saved = loadState();
    if (saved.path && saved.path !== location.pathname) {
      if (saved.path === '/player' && !saved.ctx) return;
      navigate(saved.path, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => saveState(location.pathname, playContext), [location.pathname, playContext]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = useCallback((path: string) => {
    if (path === '/player' && !playContext) return;
    navigate(path);
  }, [navigate, playContext]);

  const handlePlayEpisode = useCallback((animeTitle: string, epNum: number, episodeHref: string) => {
    const ctx = { animeTitle, epNum, episodeHref };
    setPlayContext(ctx);
    saveState('/player', ctx);
    navigate('/player');
  }, [navigate]);

  const handlePlayLocal = useCallback((animeTitle: string, epNum: number, _episodeHref?: string, filePath?: string) => {
    const ctx = { animeTitle, epNum, episodeHref: _episodeHref || '', filePath };
    setPlayContext(ctx);
    saveState('/player', ctx);
    navigate('/player');
  }, [navigate]);

  const handleClearPlayer = useCallback(() => {
    setPlayContext(null);
    saveState('/', null);
    navigate('/');
  }, [navigate]);

  const handleNavigateEpisode = useCallback((animeTitle: string, epNum: number, episodeHref: string, filePath?: string) => {
    const ctx = { animeTitle, epNum, episodeHref, filePath };
    setPlayContext(ctx);
    saveState('/player', ctx);
  }, []);

  const handleNavSearch = useCallback(() => {
    if (navSearchOpen && navSearchVal.trim()) {
      try { localStorage.setItem('chiflix_nav_search', navSearchVal.trim()); } catch {}
      navigate('/search');
      setNavSearchOpen(false);
      setNavSearchVal('');
    } else {
      setNavSearchOpen(true);
    }
  }, [navSearchOpen, navSearchVal, navigate]);

  const currentPath = location.pathname;

  return (
    <>
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="navbar-logo" onClick={() => go('/')}>
          CHIFLIX
        </div>
        <div className="navbar-links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              className={`navbar-link${currentPath === item.path ? ' active' : ''}`}
              onClick={() => go(item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="navbar-right">
          <input
            className={`navbar-search${navSearchOpen ? ' open' : ''}`}
            placeholder="애니메이션 검색..."
            value={navSearchVal}
            onChange={(e) => setNavSearchVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavSearch()}
            onBlur={() => { if (!navSearchVal) setNavSearchOpen(false); }}
          />
          <button className="navbar-search-btn" onClick={handleNavSearch}>🔍</button>
        </div>
      </nav>

      <div className="main" onClick={() => { if (navSearchOpen && !navSearchVal) setNavSearchOpen(false); }}>
        <Routes>
          <Route path="/" element={<HomeView onPlayLocal={handlePlayLocal} />} />
          <Route path="/search" element={<SearchView onPlayEpisode={handlePlayEpisode} />} />
          <Route path="/player" element={
            playContext
              ? <PlayerView key={`${playContext.animeTitle}-${playContext.epNum}`} animeTitle={playContext.animeTitle} epNum={playContext.epNum} episodeHref={playContext.episodeHref} filePath={playContext.filePath} onClear={handleClearPlayer} onNavigate={handleNavigateEpisode} />
              : <div className="player-view-content"><div className="empty-state">선택된 애니메이션이 없습니다</div></div>
          } />
          <Route path="/mylist" element={<PlaylistView onPlayLocal={handlePlayLocal} />} />
        </Routes>
        {currentPath !== '/player' && (
          <div className="footer">
            <p></p>
          </div>
        )}
      </div>
    </>
  );
}
