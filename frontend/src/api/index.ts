import type { SearchResult, EpisodeItem, WatchlistItem, LocalFile, DownloadProgress } from '../types';

const API_BASE = '/api';

const WL_KEY = 'chiflix_watchlist';

function getLocalWL(): Record<string, WatchlistItem> {
  try { return JSON.parse(localStorage.getItem(WL_KEY) || '{}'); } catch { return {}; }
}
function setLocalWL(data: Record<string, WatchlistItem>) {
  try { localStorage.setItem(WL_KEY, JSON.stringify(data)); } catch {}
}
function getLocalTime(title: string, ep: number): number {
  try { return parseInt(localStorage.getItem('chiflix_progress_' + title + '_' + ep) || '0', 10); } catch { return 0; }
}
function setLocalTime(title: string, ep: number, ms: number) {
  try { localStorage.setItem('chiflix_progress_' + title + '_' + ep, String(ms)); } catch {}
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function searchAnime(query: string): Promise<SearchResult[]> {
  const data = await fetchJSON<{ results: SearchResult[] }>('/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  return data.results;
}

export async function getEpisodes(href: string, force?: boolean): Promise<EpisodeItem[]> {
  const data = await fetchJSON<{ episodes: EpisodeItem[] }>(`/episodes?href=${encodeURIComponent(href)}&force=${force ? 'true' : 'false'}`, { method: 'POST' });
  return data.episodes;
}

export async function getStreamLink(episodeHref: string): Promise<string> {
  const data = await fetchJSON<{ link: string }>('/stream', {
    method: 'POST',
    body: JSON.stringify({ episode_href: episodeHref }),
  });
  return data.link;
}

export async function getLocalFiles(): Promise<Record<string, LocalFile[]>> {
  const data = await fetchJSON<{ files: Record<string, LocalFile[]> }>('/local-files');
  return data.files;
}

export async function getWatchlist(): Promise<Record<string, WatchlistItem>> {
  try {
    const data = await fetchJSON<{ watchlist: Record<string, WatchlistItem> }>('/watchlist');
    setLocalWL(data.watchlist);
    return data.watchlist;
  } catch {
    return getLocalWL();
  }
}

export async function addToWatchlist(animeTitle: string, imgSrc?: string): Promise<void> {
  const wl = getLocalWL();
  wl[animeTitle] = wl[animeTitle] || { last_watched_episode: 0, img_src: null, episodes: {} };
  wl[animeTitle].is_favorited = true;
  if (imgSrc) wl[animeTitle].img_src = imgSrc;
  setLocalWL(wl);
  try {
    await fetchJSON('/watchlist/add', {
      method: 'POST',
      body: JSON.stringify({ anime_title: animeTitle, img_src: imgSrc || null }),
    });
  } catch {}
}

export async function removeFromWatchlist(animeTitle: string): Promise<void> {
  const wl = getLocalWL();
  if (wl[animeTitle]) wl[animeTitle].is_favorited = false;
  setLocalWL(wl);
  try {
    await fetchJSON(`/watchlist/remove?anime_title=${encodeURIComponent(animeTitle)}`, { method: 'POST' });
  } catch {}
}

export async function getProgress(animeTitle: string, epNum: number): Promise<number> {
  const local = getLocalTime(animeTitle, epNum);
  try {
    const data = await fetchJSON<{ time_ms: number }>(`/progress?anime_title=${encodeURIComponent(animeTitle)}&ep_num=${epNum}`);
    if (data.time_ms > 0) setLocalTime(animeTitle, epNum, data.time_ms);
    return data.time_ms || local;
  } catch {
    return local;
  }
}

export async function saveProgress(animeTitle: string, epNum: number, timeMs: number, episodeHref?: string, imgSrc?: string, totalMs?: number): Promise<void> {
  setLocalTime(animeTitle, epNum, Math.round(timeMs));
  const wl = getLocalWL();
  if (!wl[animeTitle]) {
    wl[animeTitle] = { last_watched_episode: 0, img_src: null, episodes: {} };
  }
  wl[animeTitle].episodes = wl[animeTitle].episodes || {};
  wl[animeTitle].episodes[String(epNum)] = { time_ms: Math.round(timeMs), total_ms: totalMs || undefined };
  wl[animeTitle].last_watched_episode = Math.max(wl[animeTitle].last_watched_episode || 0, epNum);
  wl[animeTitle].is_favorited = true;
  setLocalWL(wl);
  try {
    await fetchJSON('/progress', {
      method: 'POST',
      body: JSON.stringify({ anime_title: animeTitle, ep_num: epNum, time_ms: Math.round(timeMs), episode_href: episodeHref || null, img_src: imgSrc || null, total_ms: totalMs || null }),
    });
  } catch {}
}

export async function isFavorited(animeTitle: string): Promise<boolean> {
  try {
    const data = await fetchJSON<{ favorited: boolean }>(`/favorited?anime_title=${encodeURIComponent(animeTitle)}`);
    return data.favorited;
  } catch {
    const wl = getLocalWL();
    return !!(wl[animeTitle] && wl[animeTitle].is_favorited);
  }
}

export async function startDownload(animeTitle: string, epNum: number, targetSlug: string): Promise<string> {
  const data = await fetchJSON<{ task_id: string }>('/download/start', {
    method: 'POST',
    body: JSON.stringify({ anime_title: animeTitle, ep_num: epNum, target_slug: targetSlug }),
  });
  return data.task_id;
}

export async function getDownloadProgress(taskId: string): Promise<DownloadProgress> {
  return fetchJSON<DownloadProgress>(`/download/progress?task_id=${encodeURIComponent(taskId)}`);
}

export async function findLocalFile(animeTitle: string, epNum: number): Promise<string | null> {
  const data = await fetchJSON<{ path: string | null }>(`/find-local?anime_title=${encodeURIComponent(animeTitle)}&ep_num=${epNum}`);
  return data.path;
}

export async function downloadEpisodeDirect(episodeHref: string, animeTitle: string, epNum: number): Promise<string> {
  const data = await fetchJSON<{ task_id: string }>('/download2', {
    method: 'POST',
    body: JSON.stringify({ episode_href: episodeHref, anime_title: animeTitle, ep_num: epNum }),
  });
  return data.task_id;
}

export async function deleteLocalFile(path: string): Promise<void> {
  await fetchJSON(`/local-file/delete?path=${encodeURIComponent(path)}`, { method: 'POST' });
}
