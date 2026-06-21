export interface SearchResult {
  href: string;
  text: string;
  img_src: string | null;
  date_str?: string | null;
}

export interface EpisodeItem {
  href: string;
  text: string;
  ep_num: number;
}

export interface WatchlistItem {
  last_watched_episode: number;
  img_src: string | null;
  episodes: Record<string, { time_ms: number; total_ms?: number }>;
}

export interface LocalFile {
  filename: string;
  path: string;
}

export interface DownloadProgress {
  status: string;
  percent: number;
  speed?: string;
  error?: string | null;
}

export interface ContentItem {
  title: string;
  img_src?: string;
  badge?: string;
  rank?: number;
}

export interface EpisodeInfo {
  title: string;
  meta: string;
  desc: string;
}

export interface TrackedShow {
  title: string;
  sub: string;
  active?: boolean;
}

export interface ProgressInfo {
  title: string;
  sub: string;
  pct: number;
}
