import os
import re
import sys
import json
import threading
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional
import utils.progress_manager as pm
import scraper_api

app = FastAPI(title="Chiflix Stream API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchQuery(BaseModel):
    query: str

class StreamRequest(BaseModel):
    episode_href: str
    anime_title: str = ""
    ep_num: int = 0

class DownloadRequest(BaseModel):
    anime_title: str
    ep_num: int
    target_slug: str

class ProgressUpdate(BaseModel):
    anime_title: str
    ep_num: int
    time_ms: int
    episode_href: Optional[str] = None
    img_src: Optional[str] = None

class WatchlistAdd(BaseModel):
    anime_title: str
    img_src: Optional[str] = None

class WatchPlayRequest(BaseModel):
    anime_title: str
    ep_num: int

PROJECT_ROOT = Path(__file__).resolve().parent.parent

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/search")
def search(req: SearchQuery):
    try:
        results = scraper_api.search_anime(req.query)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/episodes")
def episodes(href: str):
    try:
        episodes = scraper_api.get_episode_list(href)
        return {"episodes": episodes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stream")
def stream(req: StreamRequest):
    try:
        link = scraper_api.get_stream_link(req.episode_href)
        if link:
            return {"link": link}
        raise HTTPException(status_code=404, detail="Stream link not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/local-files")
def local_files():
    try:
        files = scraper_api.get_local_files()
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/watchlist")
def watchlist():
    try:
        data = pm.load_progress()
        wl = data.get("watchlist", {})
        result = {}
        for title, info in wl.items():
            if info.get("is_favorited", False):
                result[title] = {
                    "last_watched_episode": info.get("last_watched_episode", 0),
                    "img_src": info.get("img_src"),
                    "episodes": info.get("episodes", {})
                }
        return {"watchlist": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/watchlist/add")
def watchlist_add(req: WatchlistAdd):
    try:
        pm.add_to_watchlist(req.anime_title, img_src=req.img_src)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/watchlist/remove")
def watchlist_remove(anime_title: str):
    try:
        data = pm.load_progress()
        if anime_title in data.get("watchlist", {}):
            data["watchlist"][anime_title]["is_favorited"] = False
        pm.save_progress(data)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/progress")
def get_progress(anime_title: str, ep_num: int):
    try:
        time_ms = pm.get_timeline(anime_title, ep_num)
        return {"time_ms": time_ms}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/progress")
def save_progress(req: ProgressUpdate):
    try:
        pm.update_timeline(req.anime_title, req.ep_num, req.time_ms)
        if req.episode_href:
            import utils.progress_manager as pm2
            wc = pm2.load_web_cache()
            cfg = wc.setdefault("anime_configs", {}).setdefault(req.anime_title, {})
            ehrefs = cfg.setdefault("episode_hrefs", {})
            ehrefs[str(req.ep_num)] = req.episode_href
            cfg["img_src"] = req.img_src
            pm2.save_web_cache(wc)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/favorited")
def is_favorited(anime_title: str):
    try:
        fav = pm.is_favorited(anime_title)
        return {"favorited": fav}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/anime-cache")
def get_anime_cache(anime_title: str):
    try:
        cache = pm.get_anime_cache(anime_title)
        return cache or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/anime-cache")
def save_anime_cache(anime_title: str, prefix: str = "", suffix: str = "", padding_length: int = 2, series_url: str = ""):
    try:
        pm.save_anime_cache(anime_title, prefix, suffix, padding_length, series_url)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/anime-cache/img")
def save_anime_cache_img(anime_title: str, img_src: str = ""):
    try:
        wc = pm.load_web_cache()
        cfg = wc.setdefault("anime_configs", {}).setdefault(anime_title, {})
        if img_src:
            cfg["img_src"] = img_src
        pm.save_web_cache(wc)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/download/start")
def start_download(req: DownloadRequest):
    try:
        src_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(src_dir)
        downloads_dir = os.path.join(project_root, "downloads")
        clean_folder = re.sub(r'\s+', '_', req.anime_title.strip())
        anime_folder = os.path.join(downloads_dir, clean_folder)
        os.makedirs(anime_folder, exist_ok=True)
        safe_filename = re.sub(r'\s+', '_', req.target_slug.strip())
        output_name = os.path.join(anime_folder, f"{safe_filename}.mp4")
        task_id = scraper_api.start_download_task(req.anime_title, req.ep_num, req.target_slug, output_name)
        return {"task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/progress")
def download_progress(task_id: str):
    return scraper_api.get_download_progress(task_id)

@app.get("/api/find-local")
def find_local(anime_title: str, ep_num: int):
    try:
        path = scraper_api.find_local_file(anime_title, ep_num)
        if path:
            return {"path": path}
        return {"path": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/local-file")
def serve_local_file(path: str):
    if not os.path.exists(path) or not path.endswith(".mp4"):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="video/mp4")

@app.post("/api/download2")
def download_episode(req: StreamRequest):
    try:
        link = scraper_api.get_stream_link(req.episode_href)
        if not link:
            raise HTTPException(status_code=404, detail="Stream link not found")
        src_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(src_dir)
        downloads_dir = os.path.join(project_root, "downloads")
        clean_folder = re.sub(r'\s+', '_', req.anime_title.strip())
        anime_folder = os.path.join(downloads_dir, clean_folder)
        os.makedirs(anime_folder, exist_ok=True)
        safe_slug = re.sub(r'[\\/*?:"<>|]', '', req.episode_href.split("/")[-1] or f"Ep{req.ep_num}")
        output_name = os.path.join(anime_folder, f"{safe_slug}.mp4")
        task_id = scraper_api.start_download_task_direct(link, output_name, req.anime_title, req.ep_num)
        return {"task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/local-file/delete")
def delete_local_file(path: str):
    if not path or not path.endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        os.remove(path)
        dirpath = os.path.dirname(path)
        if os.path.isdir(dirpath) and not os.listdir(dirpath):
            os.rmdir(dirpath)
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
