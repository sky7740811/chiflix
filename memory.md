# Session Memory — Chiflix2 v2

## Current Session
- **Date**: 2026-06-20
- **Focus**: Chiflix2 React+FastAPI frontend/backend development
- **Servers**: Backend (port 8000), Frontend (port 3000)

## Completed Features
- Netflix-style React frontend (navbar, hero, search grid, player overlay, my list)
- FastAPI backend with scraper/progress_manager integration
- Video player with overlay controls, timeline, volume, fullscreen
- Keyboard shortcuts (Space, ←→, ↑↓, F, M)
- Skip buttons (-10s, +10s, +30s) with popup overlay
- Volume popup, volume caching (localStorage)
- Progress auto-save (1s interval, persists to progress.json)
- Watchlist auto-registration on playback
- Download progress indicator
- Local file listing + delete
- Session persistence (last view, last episode)

## Known Issues / User Requests
- Downloaded file playback from UI = DISABLED (user will play locally)
- Occasional CORS issues with streaming CDN (crossOrigin removed)
- Player cursor hides after 3s idle (hide-ui + cursor: none)

## Pending
- Final custom icon created (Netflix-style red C on dark bg)
- Desktop shortcuts created (Start/Stop)
- Volume cached in localStorage
- Session state cached in localStorage

## Config Applied
- AGENTS.md strict mode: ask before editing files
- CHANGELOG.csv: log all file changes
- French comments in code
