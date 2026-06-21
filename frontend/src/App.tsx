import { useState, useCallback, useEffect } from 'react';
import HomeView from './components/HomeView';
import SearchView from './components/SearchView';
import PlayerView from './components/PlayerView';
import PlaylistView from './components/PlaylistView';
import './App.css';

export type ViewType = 'home' | 'search' | 'player' | 'mylist';

interface PlayContext {
  animeTitle: string;
  epNum: number;
  episodeHref: string;
  filePath?: string;
}

const LS_KEY = 'chiflix_state';

function loadState(): { view: ViewType; ctx: PlayContext | null } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { view: 'home', ctx: null };
}

function saveState(view: ViewType, ctx: PlayContext | null) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ view, ctx })); } catch {}
}

const NAV_ITEMS = [
  { key: 'home' as ViewType, label: 'Home' },
  { key: 'search' as ViewType, label: 'Search' },
  { key: 'player' as ViewType, label: 'Player' },
  { key: 'mylist' as ViewType, label: 'My List' },
];

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>(() => loadState().view);
  const [playContext, setPlayContext] = useState<PlayContext | null>(() => loadState().ctx);
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchVal, setNavSearchVal] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => saveState(currentView, playContext), [currentView, playContext]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handlePlayEpisode = useCallback((animeTitle: string, epNum: number, episodeHref: string) => {
    const ctx = { animeTitle, epNum, episodeHref };
    setPlayContext(ctx);
    setCurrentView('player');
    saveState('player', ctx);
  }, []);

  const handlePlayLocal = useCallback((animeTitle: string, epNum: number, _episodeHref?: string, filePath?: string) => {
    const ctx = { animeTitle, epNum, episodeHref: _episodeHref || '', filePath };
    setPlayContext(ctx);
    setCurrentView('player');
    saveState('player', ctx);
  }, []);

  const handleClearPlayer = useCallback(() => {
    setPlayContext(null);
    setCurrentView('home');
    saveState('home', null);
  }, []);

  const handleNavigateEpisode = useCallback((animeTitle: string, epNum: number, episodeHref: string, filePath?: string) => {
    const ctx = { animeTitle, epNum, episodeHref, filePath };
    setPlayContext(ctx);
    saveState('player', ctx);
  }, []);

  const handleNavSearch = useCallback(() => {
    if (navSearchOpen && navSearchVal.trim()) {
      setCurrentView('search');
      setNavSearchOpen(false);
      setNavSearchVal('');
    } else {
      setNavSearchOpen(true);
    }
  }, [navSearchOpen, navSearchVal]);

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <HomeView onPlayLocal={handlePlayLocal} />;
      case 'search':
        return <SearchView onPlayEpisode={handlePlayEpisode} />;
      case 'player':
        return playContext
          ? <PlayerView key={`${playContext.animeTitle}-${playContext.epNum}`} animeTitle={playContext.animeTitle} epNum={playContext.epNum} episodeHref={playContext.episodeHref} filePath={playContext.filePath} onClear={handleClearPlayer} onNavigate={handleNavigateEpisode} />
          : <div className="player-view-content"><div className="empty-state">No anime selected.</div></div>;
      case 'mylist':
        return <PlaylistView onPlayLocal={handlePlayLocal} />;
    }
  };

  return (
    <>
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="navbar-logo" onClick={() => setCurrentView('home')}>
          CHIFLIX<span>Pro</span>
        </div>
        <div className="navbar-links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`navbar-link${currentView === item.key ? ' active' : ''}`}
              onClick={() => {
                if (item.key === 'player' && !playContext) return;
                setCurrentView(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="navbar-right">
          <input
            className={`navbar-search${navSearchOpen ? ' open' : ''}`}
            placeholder="Search anime..."
            value={navSearchVal}
            onChange={(e) => setNavSearchVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavSearch()}
            onBlur={() => { if (!navSearchVal) setNavSearchOpen(false); }}
          />
          <button className="navbar-search-btn" onClick={handleNavSearch}>🔍</button>
        </div>
      </nav>

      <div className="main" onClick={() => { if (navSearchOpen && !navSearchVal) setNavSearchOpen(false); }}>
        {renderView()}
        {currentView !== 'player' && (
          <div className="footer">
            <p>Chiflix Stream Pro v2 · React + FastAPI</p>
          </div>
        )}
      </div>
    </>
  );
}
