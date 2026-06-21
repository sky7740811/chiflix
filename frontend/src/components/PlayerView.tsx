import { useRef, useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { DownloadProgress, EpisodeItem } from '../types';

interface PlayerViewProps {
  animeTitle: string;
  epNum: number;
  episodeHref: string;
  filePath?: string;
  onClear: () => void;
  onNavigate?: (title: string, ep: number, href: string, filePath?: string) => void;
}

export default function PlayerView({ animeTitle, epNum, episodeHref, filePath, onClear, onNavigate }: PlayerViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeRef = useRef(0);
  const hrefRef = useRef('');
  const skipBaseRef = useRef(0);
  const skipAccumRef = useRef(0);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [volume, setVolume] = useState(() => { try { return parseInt(localStorage.getItem('chiflix_vol') || '70', 10); } catch { return 70; } });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [favorited, setFavorited] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(70);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [showEpList, setShowEpList] = useState(false);
  const [volHover, setVolHover] = useState(false);
  const [currentEpNum, setCurrentEpNum] = useState(epNum);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [volPopup, setVolPopup] = useState<number | null>(null);
  const [skipPopup, setSkipPopup] = useState<{ sec: number; side: 'left' | 'right' } | null>(null);
  const volPopupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipPopupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLog = useCallback((msg: string) => setLogs((p) => [...p.slice(-20), msg]), []);

  const bumpTimerRef = useRef(0);

  const bumpControls = useCallback(() => {
    const now = Date.now();
    if (now - bumpTimerRef.current < 200) return;
    bumpTimerRef.current = now;
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playingRef.current) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, []);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  /* Fetch stream */
  useEffect(() => {
    if (!animeTitle) return;
    let dead = false;
    (async () => {
      try {
        addLog(`화 로딩 중...${epNum}...`);

        // 1) Direct file path
        if (filePath) {
          addLog('로컬 파일 경로 제공됨');
          if (!dead) { setStreamUrl(`/api/local-file?path=${encodeURIComponent(filePath)}`); setIsDownloaded(true); return; }
        }

        // 2) Search local file
        const localPath = await api.findLocalFile(animeTitle, epNum);
        if (localPath) {
          addLog('로컬 파일 발견');
          setIsDownloaded(true);
          if (!dead) setStreamUrl(`/api/local-file?path=${encodeURIComponent(localPath)}`);
          return;
        }
        setIsDownloaded(false);

        // 3) Use direct episodeHref if provided
        let href = episodeHref;
        if (!href) {
          // 4) Try to find href from cached episodes
          try {
            const cache = await (await fetch(`/api/anime-cache?anime_title=${encodeURIComponent(animeTitle)}`)).json();
            if (cache?.episode_hrefs && cache.episode_hrefs[String(epNum)]) {
              href = cache.episode_hrefs[String(epNum)];
            } else if (cache?.series_url) {
              const eps = await api.getEpisodes(cache.series_url);
              setEpisodes(eps);
              const found = eps.find((e: any) => e.ep_num === epNum);
              if (found) href = found.href;
            }
          } catch {}
        }

        if (!href) {
          if (!dead) addLog('에피소드 URL이 없습니다');
          return;
        }
        addLog('스트림 링크 가져오는 중...');
        const link = await api.getStreamLink(href);
        if (!dead && link) { setStreamUrl(link); addLog('스트림 링크 획득'); }
        else if (!dead) addLog('오류: 스트림 링크를 찾을 수 없음');
      } catch (err: unknown) {
        if (!dead) addLog(`오류: ${err instanceof Error ? err.message : ''}`);
      }
    })();
    return () => { dead = true; };
  }, [animeTitle, epNum, episodeHref, filePath, addLog]);

  useEffect(() => { hrefRef.current = episodeHref; }, [episodeHref]);

  useEffect(() => {
    if (streamUrl && videoRef.current) {
      /* Seek to saved progress */
      (async () => {
        try {
          let t = 0;
          try { t = parseInt(localStorage.getItem('chiflix_progress_' + animeTitle + '_' + currentEpNum) || '0', 10); } catch {}
          if (t <= 0) t = await api.getProgress(animeTitle, currentEpNum);
          if (t > 3000) {
            const check = setInterval(() => {
              if (videoRef.current && videoRef.current.readyState >= 1) {
                videoRef.current.currentTime = t / 1000;
                clearInterval(check);
              }
            }, 200);
            setTimeout(() => clearInterval(check), 10000);
          }
        } catch {}
      })();
    }
  }, [streamUrl]);

  /* Sync volume to video element whenever volume state changes */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume / 100;
    }
  }, [volume]);

  useEffect(() => {
    (async () => { if (animeTitle) try { setFavorited(await api.isFavorited(animeTitle)); } catch {} })();
    (async () => { try { const c = await (await fetch(`/api/anime-cache?anime_title=${encodeURIComponent(animeTitle)}`)).json(); if (c?.img_src) setImgSrc(c.img_src); } catch {} })();
  }, [animeTitle]);

  /* Fetch episode list */
  useEffect(() => {
    (async () => {
      try {
        const cache = await (await fetch(`/api/anime-cache?anime_title=${encodeURIComponent(animeTitle)}`)).json();
        if (cache?.series_url) {
          const eps = await api.getEpisodes(cache.series_url);
          setEpisodes(eps);
        }
      } catch {}
    })();
  }, [animeTitle]);

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  /* Auto-save progress every 1s + sync time display */
  useEffect(() => {
    if (!playing || !animeTitle || !currentEpNum) return;
    const iv = setInterval(async () => {
      const t = timeRef.current;
      if (t <= 0) return;
      try { await api.saveProgress(animeTitle, currentEpNum, Math.round(t), hrefRef.current || undefined, imgSrc || undefined, duration > 0 ? duration : undefined); } catch {}
      setCurrentTime(t);
    }, 1000);
    return () => { clearInterval(iv); };
  }, [playing, animeTitle, currentEpNum]);

  /* Save on pause */
  const doSaveProgress = useCallback(async () => {
    const t = timeRef.current;
    if (t <= 0 || !animeTitle || !currentEpNum) return;
    try {
      localStorage.setItem('chiflix_progress_' + animeTitle + '_' + currentEpNum, String(Math.round(t)));
      await api.saveProgress(animeTitle, currentEpNum, Math.round(t), hrefRef.current || undefined, imgSrc || undefined, duration > 0 ? duration : undefined);
    } catch {}
  }, [animeTitle, currentEpNum, imgSrc, duration]);

  useEffect(() => {
    if (!playing && timeRef.current > 0 && animeTitle && currentEpNum) {
      doSaveProgress();
    }
  }, [playing, doSaveProgress, animeTitle, currentEpNum]);

  /* Save on unmount */
  useEffect(() => {
    return () => { doSaveProgress(); };
  }, [doSaveProgress]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play().catch(() => {}); setPlaying(true); playingRef.current = true; }
    else { videoRef.current.pause(); setPlaying(false); playingRef.current = false; }
    bumpControls();
  }, [bumpControls]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const nm = !videoRef.current.muted;
    videoRef.current.muted = nm; setMuted(nm);
    if (nm) setPrevVolume(volume); else { setVolume(prevVolume); videoRef.current.volume = prevVolume / 100; }
    bumpControls();
  }, [volume, prevVolume, bumpControls]);

  const changeVol = useCallback((v: number) => {
    const newVol = Math.max(0, Math.min(100, v));
    setVolume(newVol);
    localStorage.setItem('chiflix_vol', String(newVol));
    if (videoRef.current) { videoRef.current.volume = newVol / 100; videoRef.current.muted = false; }
    setMuted(false);
    setVolPopup(newVol);
    if (volPopupTimer.current) clearTimeout(volPopupTimer.current);
    volPopupTimer.current = setTimeout(() => setVolPopup(null), 1500);
    bumpControls();
  }, [bumpControls]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    videoRef.current.currentTime = ((e.clientX - r.left) / r.width) * (videoRef.current.duration || 0);
  }, []);

  const skip = useCallback((sec: number) => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration || 0;
    if (skipAccumRef.current === 0) skipBaseRef.current = videoRef.current.currentTime;
    skipAccumRef.current += sec;
    videoRef.current.currentTime = Math.max(0, Math.min(skipBaseRef.current + skipAccumRef.current, dur));
    const side = sec < 0 ? 'left' : 'right';
    setSkipPopup({ sec, side });
    if (skipPopupTimer.current) clearTimeout(skipPopupTimer.current);
    skipPopupTimer.current = setTimeout(() => { setSkipPopup(null); skipAccumRef.current = 0; }, 1200);
    bumpControls();
  }, [bumpControls]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (wrapperRef.current) await wrapperRef.current.requestFullscreen();
    bumpControls();
  }, [bumpControls]);

  const onDblClick = useCallback(() => toggleFullscreen(), [toggleFullscreen]);

  const currentEpIdx = episodes.findIndex((e) => e.ep_num === currentEpNum);

  const goToEpisode = useCallback((targetEp: number, targetHref: string) => {
    setPlaying(false); playingRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setShowEpList(false);
    setCurrentEpNum(targetEp);
    setIsDownloaded(false);
    setStreamUrl(null);
    if (onNavigate) onNavigate(animeTitle, targetEp, targetHref);
    (async () => {
      addLog(`화로 전환 중...${targetEp}...`);
      const localPath = await api.findLocalFile(animeTitle, targetEp);
      if (localPath) {
        addLog('로컬 파일 발견');
        setStreamUrl(`/api/local-file?path=${encodeURIComponent(localPath)}`);
        return;
      }
      const link = await api.getStreamLink(targetHref);
      if (link) { setStreamUrl(link); addLog('스트림 링크 획득'); }
      else addLog('오류: 스트림 링크를 찾을 수 없음');
    })();
  }, [animeTitle, addLog]);

  const prevEpisode = useCallback(() => {
    if (currentEpIdx > 0) {
      const prev = episodes[currentEpIdx - 1];
      goToEpisode(prev.ep_num, prev.href);
    }
  }, [currentEpIdx, episodes, goToEpisode]);

  const nextEpisode = useCallback(() => {
    if (currentEpIdx >= 0 && currentEpIdx < episodes.length - 1) {
      const next = episodes[currentEpIdx + 1];
      goToEpisode(next.ep_num, next.href);
    }
  }, [currentEpIdx, episodes, goToEpisode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowUp': e.preventDefault(); changeVol(volume + 5); break;
        case 'ArrowDown': e.preventDefault(); changeVol(volume - 5); break;
        case 'KeyF': toggleFullscreen(); break;
        case 'KeyM': toggleMute(); break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, skip, toggleFullscreen, toggleMute, volume, changeVol]);

  const handleFavorite = useCallback(async () => {
    setFavorited(true);
    try { await api.addToWatchlist(animeTitle); addLog('찜한 목록에 추가됨'); }
    catch { setFavorited(false); addLog('오류: 추가 실패'); }
  }, [animeTitle, addLog]);

  const handleDownload = useCallback(async () => {
    if (!episodeHref) return;
    setDownloading(true); setDlProgress(null); addLog('다운로드 시작 중...');
    try {
      const taskId = await api.downloadEpisodeDirect(episodeHref, animeTitle, epNum);
      const poll = setInterval(async () => {
        const prog = await api.getDownloadProgress(taskId);
        setDlProgress(prog);
        if (prog.status === 'completed' || prog.status === 'error') {
          clearInterval(poll);
          addLog(prog.status === 'completed' ? '완료!' : `실패: ${prog.error || ''}`);
          setDownloading(false);
        }
      }, 1000);
    } catch { addLog('오류: 다운로드 실패'); setDownloading(false); }
  }, [episodeHref, animeTitle, epNum, addLog]);

  const fmt = (ms: number) => {
    if (!ms || !isFinite(ms)) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  /* ── SVG Components ── */

  const SBackArrow = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );

  const SPlay = () => (
    <svg viewBox="0 0 24 24" fill="#fff"><polygon points="7,4 19,12 7,20"/></svg>
  );

  const SPause = () => (
    <svg viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
  );

  const SRewind10 = () => (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff">
      <path fillRule="evenodd" d="M11.02 2.05A10 10 0 1 1 2 12H0a12 12 0 1 0 5-9.75V1H3v4a1 1 0 0 0 1 1h4V4H6a10 10 0 0 1 5.02-1.95M2 4v3h3v2H1a1 1 0 0 1-1-1V4zm12.13 12q-.88 0-1.53-.42-.64-.44-1-1.22a5 5 0 0 1-.35-1.86q0-1.05.35-1.85.36-.79 1-1.22A2.7 2.7 0 0 1 14.13 9a2.65 2.65 0 0 1 2.52 1.65q.35.79.35 1.85 0 1.07-.35 1.86a3 3 0 0 1-1.01 1.22 2.7 2.7 0 0 1-1.52.42m0-1.35q.59 0 .91-.56.34-.56.34-1.59 0-1.01-.34-1.58-.33-.57-.91-.57-.6 0-.92.57-.34.56-.34 1.58t.34 1.6q.33.54.91.55m-5.53 1.2v-5.13l-1.6.42V9.82l3.2-.8v6.84z"/>
    </svg>
  );

  const SForward10 = () => (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff">
      <path fillRule="evenodd" d="M6.44 3.69A10 10 0 0 1 18 4h-2v2h4a1 1 0 0 0 1-1V1h-2v1.25A12 12 0 1 0 24 12h-2A10 10 0 1 1 6.44 3.69M22 4v3h-3v2h4a1 1 0 0 0 1-1V4zm-9.4 11.58q.66.42 1.53.42a2.7 2.7 0 0 0 1.5-.42q.67-.44 1.02-1.22.35-.8.35-1.86 0-1.05-.35-1.85A2.65 2.65 0 0 0 14.13 9a2.7 2.7 0 0 0-1.53.43q-.64.44-1 1.22a4.5 4.5 0 0 0-.35 1.85q0 1.07.35 1.86.36.78 1 1.22m2.44-1.49q-.33.56-.91.56-.6 0-.92-.56-.34-.56-.34-1.59 0-1.01.34-1.58.33-.57.91-.57.6 0 .92.57.34.56.34 1.58t-.34 1.6M8.6 10.72v5.14h1.6V9.02l-3.2.8v1.32z"/>
    </svg>
  );

  const SForward30 = () => (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff">
      <path fillRule="evenodd" d="M6.44 3.69A10 10 0 0 1 18 4h-2v2h4a1 1 0 0 0 1-1V1h-2v1.25A12 12 0 1 0 24 12h-2A10 10 0 1 1 6.44 3.69M22 4v3h-3v2h4a1 1 0 0 0 1-1V4z"/>
      <text x="13" y="16" fontSize="9" fill="#fff" textAnchor="middle" fontWeight="700" fontFamily="Arial,sans-serif">30</text>
    </svg>
  );

  const SForward90 = () => (
    <svg viewBox="0 0 24 24" width="32" height="32" fill="#e50914">
      <path fillRule="evenodd" d="M6.44 3.69A10 10 0 0 1 18 4h-2v2h4a1 1 0 0 0 1-1V1h-2v1.25A12 12 0 1 0 24 12h-2A10 10 0 1 1 6.44 3.69M22 4v3h-3v2h4a1 1 0 0 0 1-1V4z"/>
      <text x="13" y="16" fontSize="9" fill="#e50914" textAnchor="middle" fontWeight="800" fontFamily="Arial,sans-serif">90</text>
    </svg>
  );

  const SVolHigh = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  );

  const SVolMuted = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/>
      <line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  );

  const SPrevEp = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 4 7 12 19 20"/>
      <line x1="7" y1="4" x2="7" y2="20"/>
    </svg>
  );

  const SNextEp = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 17 12 5 20"/>
      <line x1="17" y1="4" x2="17" y2="20"/>
    </svg>
  );

  const SPip = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <rect x="12" y="10" width="8" height="6" rx="1" fill="rgba(255,255,255,.15)"/>
    </svg>
  );

  const SSubtitles = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3"/>
      <line x1="6" y1="10" x2="10" y2="10"/>
      <line x1="6" y1="14" x2="14" y2="14"/>
    </svg>
  );

  const SSpeed = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );

  const SFullscreen = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );

  const SFullscreenExit = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20"/>
      <polyline points="20 10 14 10 14 4"/>
      <line x1="14" y1="10" x2="21" y2="3"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );

  const SEpList = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );

  const volIcon = muted || volume === 0 ? <SVolMuted /> : <SVolHigh />;

  if (!animeTitle) {
    return <div className="player-view-content"><div className="empty-state">선택된 애니메이션이 없습니다</div></div>;
  }

  return (
    <div className="player-view-content" style={{ padding: 0 }}>
      <div
        className={`player-wrapper nf-style${showControls ? '' : ' hide-ui'}${isFullscreen ? ' fullscreen' : ''}`}
        ref={wrapperRef}
        onMouseMove={bumpControls}
        onMouseLeave={() => { playing && setShowControls(false); setVolHover(false); }}
      >
        <video ref={videoRef} src={streamUrl || undefined} autoPlay
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration * 1000); }}
          onTimeUpdate={() => { if (videoRef.current) { const t = videoRef.current.currentTime * 1000; timeRef.current = t; } }}
        />

        {/* Volume change popup */}
        {volPopup !== null && (
          <div className="vol-popup">
            <span className="vol-popup-text">{volPopup}%</span>
          </div>
        )}

        {/* Skip popup — icon overlay on left or right */}
        {skipPopup !== null && (
          <div style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            left: skipPopup.side === 'left' ? '60px' : 'auto',
            right: skipPopup.side === 'right' ? '60px' : 'auto',
            zIndex: 10,
            pointerEvents: 'none',
            opacity: 0.5,
            filter: 'drop-shadow(0 0 16px rgba(0,0,0,.8))',
          }}>
            <div style={{ transform: 'scale(2)', transformOrigin: 'center center' }}>
              {Math.abs(skipPopup.sec) === 90 ? <SForward90 /> :
               Math.abs(skipPopup.sec) === 30 ? <SForward30 /> :
               Math.abs(skipPopup.sec) === 10 && skipPopup.side === 'right' ? <SForward10 /> :
               <SRewind10 />}
            </div>
          </div>
        )}

        {/* Click catcher: play/pause on video area, fullscreen on double-click */}
        <div className="player-click-catcher" onClick={togglePlay} onDoubleClick={onDblClick} />

        {/* Top: back arrow */}
        <div className="nf-top">
          <button className="nf-btn nf-btn-top" onClick={onClear} title="뒤로"><SBackArrow /></button>
        </div>

        {/* Center play */}
        {!playing && (
          <div className="player-center-btn" onClick={togglePlay}>
            <div className="play-circle-sm"><SPlay /></div>
          </div>
        )}

        {/* Episode list panel */}
        {showEpList && episodes.length > 0 && (
          <div className="nf-ep-panel">
            <div className="nf-ep-header">
              <span>Episodes</span>
              <button className="nf-btn" onClick={() => setShowEpList(false)}>✕</button>
            </div>
            <div className="nf-ep-list">
              {episodes.map((ep, i) => (
                <div key={i}
                  className={`nf-ep-item${ep.ep_num === currentEpNum ? ' active' : ''}`}
                  onClick={() => {
                    if (ep.ep_num !== currentEpNum) goToEpisode(ep.ep_num, ep.href);
                    else setShowEpList(false);
                  }}
                >
                  <span className="nf-ep-num">{ep.ep_num}</span>
                  <span className="nf-ep-text">{ep.text}</span>
                  {ep.ep_num === currentEpNum && <span className="nf-ep-now">NOW</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom overlay */}
        <div className="nf-bottom">
          <div className="nf-timeline-row">
            <span className="nf-time">{fmt(currentTime)}</span>
            <div className="nf-timeline" onClick={seek}>
              <div className="nf-timeline-bg" />
              <div className="nf-timeline-fill" style={{ width: `${progressPct}%` }} />
              <div className="nf-timeline-thumb" style={{ left: `${progressPct}%` }} />
            </div>
            <span className="nf-time">-{fmt(Math.max(0, duration - currentTime))}</span>
          </div>

          <div className="nf-controls">
            <div className="nf-ctrl-left">
              <button className="nf-btn" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
                {playing ? <SPause /> : <SPlay />}
              </button>
              <button className="nf-btn" onClick={() => skip(-10)} title="10초 뒤로"><SRewind10 /></button>
              <button className="nf-btn" onClick={() => skip(10)} title="10초 앞으로"><SForward10 /></button>
              <button className="nf-btn" onClick={() => skip(30)} title="30초 앞으로"><SForward30 /></button>
              <button className="nf-btn" onClick={() => skip(90)} title="90초 앞으로"><SForward90 /></button>
              <div className="nf-vol-wrap"
                onMouseEnter={() => setVolHover(true)}
                onMouseLeave={() => setVolHover(false)}
              >
                <button className="nf-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
                  {volIcon}
                </button>
                {volHover && (
                  <div className="nf-vol-popup">
                    <input type="range" min="0" max="100" value={muted ? 0 : volume}
                      onChange={(e) => changeVol(Number(e.target.value))}
                      onMouseUp={() => setVolHover(false)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="nf-ctrl-center">
              {animeTitle} {currentEpNum}화
            </div>

            <div className="nf-ctrl-right">
              <button className="nf-btn" onClick={prevEpisode} disabled={currentEpIdx <= 0}
                title="이전 에피소드" style={currentEpIdx <= 0 ? { opacity: .3 } : {}}>
                <SPrevEp />
              </button>
              <button className="nf-btn" onClick={nextEpisode} disabled={currentEpIdx >= episodes.length - 1}
                title="다음 에피소드" style={currentEpIdx >= episodes.length - 1 ? { opacity: .3 } : {}}>
                <SNextEp />
              </button>
              <button className="nf-btn" title="PIP 모드"><SPip /></button>
              <button className="nf-btn" title="자막"><SSubtitles /></button>
              <button className="nf-btn" title="재생 속도"><SSpeed /></button>
              <button className="nf-btn" onClick={() => setShowEpList((p) => !p)} title="에피소드 목록">
                <SEpList />
              </button>
              <button className="nf-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit' : 'Fullscreen'}>
                {isFullscreen ? <SFullscreenExit /> : <SFullscreen />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 60px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button className="btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={onClear}>← 뒤로</button>
        {favorited
          ? <span className="match">★ 찜한 목록</span>
          : <button className="btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }} onClick={handleFavorite}>+ 찜하기</button>
        }
        <button className="btn-secondary" style={{ padding: '6px 16px', fontSize: '13px', background: isDownloaded ? '✓ 다운로드 완료' : '다운로드', color: '#fff' }}
          onClick={handleDownload} disabled={downloading || isDownloaded}>
          {downloading ? '...' : isDownloaded ? '✓ 다운로드 완료' : '다운로드'}
        </button>
        {dlProgress && (
          <span style={{ fontSize: '12px', color: '#e50914', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>
            {dlProgress.percent.toFixed(0)}%
          </span>
        )}
      </div>

      {logs.length > 0 && (
        <div className="log-box" style={{ margin: '0 60px 8px' }}>
          {logs.map((msg, i) => <div key={i} className="log-line">{msg}</div>)}
        </div>
      )}
    </div>
  );
}
