import os
import json

def get_json_path():
    utils_dir = os.path.dirname(os.path.abspath(__file__))
    src_dir = os.path.dirname(utils_dir)
    project_root = os.path.dirname(src_dir)
    user_data_dir = os.path.join(project_root, "userdata")
    os.makedirs(user_data_dir, exist_ok=True)
    return os.path.join(user_data_dir, "progress.json")

def get_web_cache_path():
    utils_dir = os.path.dirname(os.path.abspath(__file__))
    src_dir = os.path.dirname(utils_dir)
    project_root = os.path.dirname(src_dir)
    user_data_dir = os.path.join(project_root, "userdata")
    os.makedirs(user_data_dir, exist_ok=True)
    return os.path.join(user_data_dir, "web_cache.json")

def load_progress():
    path = get_json_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"watchlist": {}}

def save_progress(data):
    path = get_json_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception:
        pass

def load_web_cache():
    path = get_web_cache_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"searches": {}, "episodes": {}, "anime_configs": {}}

def save_web_cache(data):
    path = get_web_cache_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception:
        pass

def clear_web_cache_file():
    path = get_web_cache_path()
    if os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

def get_cached_search(query):
    data = load_web_cache()
    return data.get("searches", {}).get(query)

def save_cached_search(query, results):
    data = load_web_cache()
    if "searches" not in data:
        data["searches"] = {}
    data["searches"][query] = results
    save_web_cache(data)

def get_cached_episodes(series_url):
    data = load_web_cache()
    return data.get("episodes", {}).get(series_url)

def save_cached_episodes(series_url, episodes):
    data = load_web_cache()
    if "episodes" not in data:
        data["episodes"] = {}
    data["episodes"][series_url] = episodes
    save_web_cache(data)

def add_to_watchlist(anime_title, img_src=None):
    data = load_progress()
    if "watchlist" not in data:
        data["watchlist"] = {}
    if anime_title not in data["watchlist"]:
        data["watchlist"][anime_title] = {
            "is_favorited": True,
            "last_watched_episode": 0,
            "episodes": {},
            "img_src": img_src
        }
    else:
        data["watchlist"][anime_title]["is_favorited"] = True
        if img_src:
            data["watchlist"][anime_title]["img_src"] = img_src
    save_progress(data)

def save_anime_cache(anime_title, prefix, suffix, padding_length, series_url=None):
    data = load_web_cache()
    if "anime_configs" not in data:
        data["anime_configs"] = {}
    data["anime_configs"][anime_title] = {
        "prefix": prefix,
        "suffix": suffix,
        "padding_length": padding_length,
        "series_url": series_url
    }
    save_web_cache(data)

def get_anime_cache(anime_title):
    data = load_web_cache()
    return data.get("anime_configs", {}).get(anime_title)

def update_timeline(anime_title, ep_num, time_ms):
    data = load_progress()
    if "watchlist" not in data:
        data["watchlist"] = {}
    if anime_title not in data["watchlist"]:
        data["watchlist"][anime_title] = {
            "is_favorited": True,
            "last_watched_episode": 0,
            "episodes": {}
        }
    
    data["watchlist"][anime_title]["is_favorited"] = True
    data["watchlist"][anime_title]["last_watched_episode"] = ep_num
    if "episodes" not in data["watchlist"][anime_title]:
        data["watchlist"][anime_title]["episodes"] = {}
        
    data["watchlist"][anime_title]["episodes"][str(ep_num)] = {"time_ms": time_ms}
    save_progress(data)

def get_timeline(anime_title, ep_num):
    data = load_progress()
    try:
        return data["watchlist"][anime_title]["episodes"][str(ep_num)]["time_ms"]
    except KeyError:
        return 0

def is_favorited(anime_title):
    data = load_progress()
    try:
        if anime_title in data.get("watchlist", {}):
            return data["watchlist"][anime_title].get("is_favorited", False)
        return False
    except KeyError:
        return False