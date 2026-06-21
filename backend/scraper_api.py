import os
import re
import sys
import time
import threading
import subprocess
from urllib.parse import unquote
import playwright.sync_api
import yt_dlp
import utils.progress_manager as pm
import scraper

_DOWNLOAD_PROGRESS = {}
_DOWNLOAD_LOCK = threading.Lock()

def search_anime(query):
    results = scraper.run_search_phase(query)
    return results

def get_episode_list(series_url):
    if not series_url.startswith("http"):
        series_url = f"https://ani.ohli24.com{series_url}" if series_url.startswith("/") else f"https://ani.ohli24.com/{series_url}"
    cached = pm.get_cached_episodes(series_url)
    if cached:
        return cached
    episodes = scraper.fetch_episode_list(series_url)
    if episodes:
        pm.save_cached_episodes(series_url, episodes)
    return episodes

def get_stream_link(episode_href):
    if not episode_href.startswith("http"):
        episode_href = f"https://ani.ohli24.com{episode_href}" if episode_href.startswith("/") else f"https://ani.ohli24.com/{episode_href}"
    captured_data = {"link": None}
    with playwright.sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        def handle_response(response):
            if "index.php?data=" in response.url and response.status == 200:
                try:
                    json_data = response.json()
                    if "securedLink" in json_data:
                        captured_data["link"] = json_data["securedLink"]
                except:
                    pass
        page.on("response", handle_response)
        try:
            page.goto(episode_href, timeout=20000)
            for _ in range(15):
                if captured_data["link"]:
                    break
                page.wait_for_timeout(1000)
        except:
            pass
        page.remove_listener("response", handle_response)
        browser.close()
    return captured_data["link"]

def get_local_files():
    src_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(src_dir)
    downloads_dir = os.path.join(project_root, "downloads")
    result = {}
    if os.path.exists(downloads_dir):
        for entry in os.listdir(downloads_dir):
            full_path = os.path.join(downloads_dir, entry)
            if os.path.isdir(full_path):
                files = []
                for f in os.listdir(full_path):
                    if f.endswith(".mp4"):
                        files.append({"filename": f, "path": os.path.join(full_path, f)})
                if files:
                    result[entry.replace("_", " ")] = files
    return result

def start_download_task(anime_title, ep_num, target_slug, output_name):
    task_id = f"{anime_title}_ep{ep_num}_{int(time.time())}"
    with _DOWNLOAD_LOCK:
        _DOWNLOAD_PROGRESS[task_id] = {"status": "starting", "percent": 0, "speed": "", "error": None}
    def _run():
        try:
            stream_link = None
            encoded_slug = target_slug.replace(" ", "%20")
            target_url = f"https://ani.ohli24.com/e/{encoded_slug}"
            with playwright.sync_api.sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                captured = {"link": None}
                def handle_response(response):
                    if "index.php?data=" in response.url and response.status == 200:
                        try:
                            json_data = response.json()
                            if "securedLink" in json_data:
                                captured["link"] = json_data["securedLink"]
                        except:
                            pass
                page.on("response", handle_response)
                page.goto(target_url, timeout=20000)
                for _ in range(15):
                    if captured["link"]:
                        break
                    page.wait_for_timeout(1000)
                page.remove_listener("response", handle_response)
                stream_link = captured["link"]
                browser.close()
            if not stream_link:
                with _DOWNLOAD_LOCK:
                    _DOWNLOAD_PROGRESS[task_id] = {"status": "error", "percent": 0, "speed": "", "error": "Failed to get stream link"}
                return
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            python_exe = sys.executable
            cmd = [python_exe, "-m", "yt_dlp", "--newline", "--no-warnings", "--user-agent", ua, "-o", output_name, stream_link]
            popen_kwargs = {}
            if os.name == "nt":
                popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                popen_kwargs["start_new_session"] = True
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, **popen_kwargs)
            pattern = re.compile(r'\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\w+)?.*?at\s+([\d.]+\w+/s|Unknown speed)')
            while True:
                line = proc.stdout.readline()
                if not line:
                    if proc.poll() is not None:
                        break
                    time.sleep(0.1)
                    continue
                match = pattern.search(line)
                if match:
                    percent = float(match.group(1))
                    speed = match.group(3) or "N/A"
                    with _DOWNLOAD_LOCK:
                        _DOWNLOAD_PROGRESS[task_id] = {"status": "downloading", "percent": percent, "speed": speed}
            proc.wait()
            with _DOWNLOAD_LOCK:
                if proc.returncode == 0:
                    _DOWNLOAD_PROGRESS[task_id] = {"status": "completed", "percent": 100, "speed": ""}
                else:
                    _DOWNLOAD_PROGRESS[task_id] = {"status": "error", "percent": 0, "speed": "", "error": f"yt-dlp exited with code {proc.returncode}"}
        except Exception as e:
            with _DOWNLOAD_LOCK:
                _DOWNLOAD_PROGRESS[task_id] = {"status": "error", "percent": 0, "speed": "", "error": str(e)}
    threading.Thread(target=_run, daemon=True).start()
    return task_id

def get_download_progress(task_id):
    with _DOWNLOAD_LOCK:
        return _DOWNLOAD_PROGRESS.get(task_id, {"status": "unknown", "percent": 0})

def start_download_task_direct(stream_link, output_name, anime_title, ep_num):
    task_id = f"{anime_title}_ep{ep_num}_{int(time.time())}"
    with _DOWNLOAD_LOCK:
        _DOWNLOAD_PROGRESS[task_id] = {"status": "starting", "percent": 0, "speed": "", "error": None}
    def _run():
        try:
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            python_exe = sys.executable
            cmd = [python_exe, "-m", "yt_dlp", "--newline", "--no-warnings", "--user-agent", ua, "-o", output_name, stream_link]
            popen_kwargs = {}
            if os.name == "nt":
                popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                popen_kwargs["start_new_session"] = True
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, **popen_kwargs)
            pattern = re.compile(r'\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\w+)?.*?at\s+([\d.]+\w+/s|Unknown speed)')
            while True:
                line = proc.stdout.readline()
                if not line:
                    if proc.poll() is not None:
                        break
                    time.sleep(0.1)
                    continue
                match = pattern.search(line)
                if match:
                    percent = float(match.group(1))
                    speed = match.group(3) or "N/A"
                    with _DOWNLOAD_LOCK:
                        _DOWNLOAD_PROGRESS[task_id] = {"status": "downloading", "percent": percent, "speed": speed}
            proc.wait()
            with _DOWNLOAD_LOCK:
                if proc.returncode == 0:
                    _DOWNLOAD_PROGRESS[task_id] = {"status": "completed", "percent": 100, "speed": ""}
                else:
                    _DOWNLOAD_PROGRESS[task_id] = {"status": "error", "percent": 0, "speed": "", "error": f"yt-dlp exited with code {proc.returncode}"}
        except Exception as e:
            with _DOWNLOAD_LOCK:
                _DOWNLOAD_PROGRESS[task_id] = {"status": "error", "percent": 0, "speed": "", "error": str(e)}
    threading.Thread(target=_run, daemon=True).start()
    return task_id

def find_local_file(anime_title, ep_num):
    return scraper.find_local_file(anime_title, ep_num)
