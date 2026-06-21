import type { SearchResult, EpisodeItem, WatchlistItem, LocalFile, DownloadProgress } from '../types';

const API_BASE = '/api';

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

export async function getEpisodes(href: string): Promise<EpisodeItem[]> {
  const data = await fetchJSON<{ episodes: EpisodeItem[] }>(`/episodes?href=${encodeURIComponent(href)}`, { method: 'POST' });
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
  const data = await fetchJSON<{ watchlist: Record<string, WatchlistItem> }>('/watchlist');
  return data.watchlist;
}

export async function addToWatchlist(animeTitle: string, imgSrc?: string): Promise<void> {
  await fetchJSON('/watchlist/add', {
    method: 'POST',
    body: JSON.stringify({ anime_title: animeTitle, img_src: imgSrc || null }),
  });
}

export async function removeFromWatchlist(animeTitle: string): Promise<void> {
  await fetchJSON(`/watchlist/remove?anime_title=${encodeURIComponent(animeTitle)}`, { method: 'POST' });
}

export async function getProgress(animeTitle: string, epNum: number): Promise<number> {
  const data = await fetchJSON<{ time_ms: number }>(`/progress?anime_title=${encodeURIComponent(animeTitle)}&ep_num=${epNum}`);
  return data.time_ms;
}

export async function saveProgress(animeTitle: string, epNum: number, timeMs: number, episodeHref?: string, imgSrc?: string): Promise<void> {
  await fetchJSON('/progress', {
    method: 'POST',
    body: JSON.stringify({ anime_title: animeTitle, ep_num: epNum, time_ms: Math.round(timeMs), episode_href: episodeHref || null, img_src: imgSrc || null }),
  });
}

export async function isFavorited(animeTitle: string): Promise<boolean> {
  const data = await fetchJSON<{ favorited: boolean }>(`/favorited?anime_title=${encodeURIComponent(animeTitle)}`);
  return data.favorited;
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
