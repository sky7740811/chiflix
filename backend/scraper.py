import os
import re
import sys
import time
import subprocess
from urllib.parse import unquote, urljoin
import playwright.sync_api
import yt_dlp
import utils.progress_manager as pm

_YTDLP_PROGRESS_RE = re.compile(
    r'\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d.]+\w+)?.*?at\s+([\d.]+\w+/s|Unknown speed)'
)

def run_yt_dlp_subprocess(app, url, output_name, user_agent, padded_ep, label="Episode"):
    python_exe = sys.executable
    cmd = [
        python_exe, "-m", "yt_dlp",
        "--newline",
        "--no-warnings",
        "--user-agent", user_agent,
        "-o", output_name,
        url,
    ]

    popen_kwargs = {}
    if os.name == "nt":
        popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        popen_kwargs["start_new_session"] = True

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        **popen_kwargs,
    )

    def _kill_process_tree():
        try:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    capture_output=True,
                )
            else:
                import signal
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    cancelled = False
    try:
        while True:
            if app.controller.cancel_download_flag:
                cancelled = True
                _kill_process_tree()
                break

            line = proc.stdout.readline()
            if not line:
                if proc.poll() is not None:
                    break
                time.sleep(0.1)
                continue

            match = _YTDLP_PROGRESS_RE.search(line)
            if match:
                percent = float(match.group(1))
                speed = match.group(3) or "N/A"
                status_text = f"Downloading {label} {padded_ep}: {percent:.1f}% ({speed})"
                app.after(0, lambda st=status_text, pc=percent: app.update_progress_ui(st, pc))
    finally:
        try:
            proc.stdout.close()
        except Exception:
            pass

    if cancelled:
        try:
            proc.wait(timeout=5)
        except Exception:
            _kill_process_tree()
        return False

    returncode = proc.wait()
    return returncode == 0

def find_local_file(anime_title, start_ep):
    src_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(src_dir)
    downloads_dir = os.path.join(project_root, "downloads")
    clean_folder_name = re.sub(r'\s+', '_', anime_title.strip())
    anime_folder = os.path.join(downloads_dir, clean_folder_name)
    
    if os.path.exists(anime_folder):
        for f in os.listdir(anime_folder):
            if f.endswith(".mp4"):
                nums = [int(n) for n in re.findall(r'\d+', f)]
                if start_ep in nums:
                    return os.path.join(anime_folder, f)
    return None

def run_search_phase(anime_title):
    print(f"[SCRAPER] Launching search pipeline for: '{anime_title}'")
    results = []
    with playwright.sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto("https://ani.ohli24.com/", timeout=20000)
            search_box = page.locator("input[type='text'], input[type='search'], input[name='stx']").first
            search_box.fill(anime_title)
            search_box.press("Enter")
            page.wait_for_timeout(3000)
            
            raw_links = page.evaluate(
                """() => {
                    let items = [];
                    document.querySelectorAll('div.list-desc a').forEach(e => {
                        let href = e.getAttribute('href');
                        let text = e.innerText;
                        let img_src = null;
                        let date_str = null;
                        
                        let container = e.closest('div.list-item, div.list-row, div.col-xs-6, div.ani-card, li, .item');
                        if (container) {
                            let img = container.querySelector('img');
                            if (img) {
                                img_src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
                            }
                            let allText = container.innerText;
                            let m = allText.match(/(\\d{4})[.\\-\\/](\\d{1,2})[.\\-\\/](\\d{1,2})/);
                            if (m) date_str = m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
                            else {
                                let m2 = allText.match(/(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일/);
                                if (m2) date_str = m2[1]+'-'+m2[2].padStart(2,'0')+'-'+m2[3].padStart(2,'0');
                            }
                        }
                        
                        if (!img_src) {
                            let up = e;
                            for (let i = 0; i < 4; i++) {
                                if (!up) break;
                                let img = up.querySelector('img');
                                if (img) {
                                    img_src = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src');
                                    if (img_src) break;
                                }
                                up = up.parentElement;
                            }
                        }
                        items.push({ href, text, img_src, date_str });
                    });
                    return items;
                }"""
            )
            
            print(f"[SCRAPER] Browser evaluation returned {len(raw_links)} raw elements.")
            seen = set()
            for item in raw_links:
                if item["href"] and item["text"] and "/c/" in item["href"]:
                    lines = [line.strip() for line in item["text"].split("\n") if line.strip()]
                    if lines:
                        first_line = lines[0]
                        if first_line not in seen:
                            seen.add(first_line)
                            img_url = item["img_src"]
                            if img_url:
                                img_url = urljoin("https://ani.ohli24.com/", img_url)
                            
                            print(f"[SCRAPER] Extracted: Title='{first_line}' | Img='{img_url}' | Date={item.get('date_str')}")
                            results.append({"href": item["href"], "text": first_line, "img_src": img_url, "date_str": item.get("date_str")})
        except Exception as err:
            print(f"[SCRAPER ERROR] Search execution faulted: {err}")
        browser.close()
    print(f"[SCRAPER] Final clean search results count: {len(results)}")
    return results

def fetch_episode_list(series_url):
    results = []
    if not series_url.startswith("http"):
        series_url = f"https://ani.ohli24.com{series_url}" if series_url.startswith("/") else f"https://ani.ohli24.com/{series_url}"
        
    with playwright.sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto(series_url, timeout=20000)
            page.wait_for_timeout(2000)
            
            # Scroll to bottom to trigger lazy loading
            for _ in range(5):
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(800)
            
            raw_links = page.evaluate(
                "() => Array.from(document.querySelectorAll('a')).filter(e => e.getAttribute('href') && e.getAttribute('href').includes('/e/')).map(e => ({ href: e.getAttribute('href'), text: e.innerText }))"
            )
            seen = set()
            for item in raw_links:
                if item["href"] not in seen:
                    seen.add(item["href"])
                    clean_text = item["text"].split("\n")[0].strip()
                    
                    match = re.search(r'(\d+)\s*화', clean_text)
                    if not match:
                        nums = re.findall(r'\d+', clean_text)
                        clean_nums = [int(n) for n in nums if int(n) not in (720, 1080, 2160)]
                        ep_val = clean_nums[-1] if clean_nums else 0
                    else:
                        ep_val = int(match.group(1))
                        
                    results.append({
                        "href": item["href"],
                        "text": clean_text,
                        "ep_num": ep_val
                    })
            results.sort(key=lambda x: x["ep_num"])
        except:
            pass
        browser.close()
    return results

def run_direct_stream_pipeline(app, anime_title, ep_num, episode_href):
    local_path = find_local_file(anime_title, ep_num)
    if local_path:
        app.log(f"SUCCESS: Local file discovered for episode {ep_num}!")
        app.after(0, lambda: app.update_progress_ui(f"Status: Playing Local File (Ep {ep_num})", 100.0))
        media = app.controller.vlc_instance.media_new(local_path)
        app.controller.vlc_player.set_media(media)
        app.controller.vlc_player.play()
        app.after(0, lambda: app.controller.vlc_player.audio_set_volume(int(app.volume_val)))
        app.after(0, lambda: app.reset_buttons())
        return

    with playwright.sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        target_url = episode_href
        if not target_url.startswith("http"):
            target_url = f"https://ani.ohli24.com{target_url}" if target_url.startswith("/") else f"https://ani.ohli24.com/{target_url}"
            
        app.log(f"Targeting explicit stream location for Episode {ep_num}...")
        app.after(0, lambda: app.update_progress_ui(f"Status: Fetching stream token for Ep {ep_num}...", 0.0))
        captured_data = {"link": None}

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
            page.goto(target_url, timeout=20000)
            max_attempts = 15
            attempts = 0
            while not captured_data["link"] and attempts < max_attempts:
                page.wait_for_timeout(1000)
                attempts += 1
        except Exception as e:
            app.log(f"Error loading stream frame: {e}")
            
        page.remove_listener("response", handle_response)
        browser.close()

    if captured_data["link"]:
        app.log("Stream link captured! Launching media playback engine...")
        app.after(0, lambda: app.update_progress_ui(f"Status: Playing Episode {ep_num}", 100.0))
        
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36"
        media = app.controller.vlc_instance.media_new(captured_data["link"])
        media.add_option(f":http-user-agent={ua}")
        
        app.controller.vlc_player.set_media(media)
        app.controller.vlc_player.play()
        app.after(0, lambda: app.controller.vlc_player.audio_set_volume(int(app.volume_val)))
    else:
        app.log("Streaming failure: Secure token generation timed out.")
        app.after(0, lambda: app.update_progress_ui("Status: Handshake failed", 0.0))
        
    app.after(0, lambda: app.reset_buttons())

def run_action_pipeline(app, anime_title, start_ep, end_ep, action_type, forced_url=None):
    src_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(src_dir)
    downloads_dir = os.path.join(project_root, "downloads")
    clean_folder_name = re.sub(r'\s+', '_', anime_title.strip())
    anime_folder = os.path.join(downloads_dir, clean_folder_name)
    
    if action_type == "watch":
        local_path = find_local_file(anime_title, start_ep)
        if local_path:
            app.log(f"SUCCESS: Local file found for episode {start_ep}!")
            app.after(0, lambda: app.update_progress_ui(f"Status: Playing Local File (Ep {start_ep})", 100.0))
            
            media = app.controller.vlc_instance.media_new(local_path)
            app.controller.vlc_player.set_media(media)
            app.controller.vlc_player.play()
            app.after(0, lambda: app.controller.vlc_player.audio_set_volume(int(app.volume_val)))
            app.after(0, lambda: app.reset_buttons())
            return

    cache = pm.get_anime_cache(anime_title) if not forced_url else None
    series_url = forced_url
    if not series_url and cache and cache.get("series_url"):
        series_url = cache["series_url"]

    valid_eps = None
    if series_url:
        valid_eps = pm.get_cached_episodes(series_url)

    if not valid_eps and series_url:
        app.log("Refreshing episode catalog data for validation boundaries...")
        valid_eps = fetch_episode_list(series_url)
        if valid_eps:
            pm.save_cached_episodes(series_url, valid_eps)

    if valid_eps:
        ep_nums = [x["ep_num"] for x in valid_eps if x["ep_num"] > 0]
        if ep_nums:
            if start_ep < min(ep_nums) or end_ep > max(ep_nums):
                app.log(f"ERROR: Episode selection out of bounds! Range allowed: {min(ep_nums)} - {max(ep_nums)}")
                app.after(0, lambda: app.update_progress_ui("Status: Out of bounds error", 0.0))
                app.after(0, lambda: app.reset_buttons())
                return
            for target_check in range(start_ep, end_ep + 1):
                if target_check not in ep_nums:
                    app.log(f"ERROR: Episode {target_check} does not exist in this series index.")
                    app.after(0, lambda: app.update_progress_ui(f"Status: Ep {target_check} missing", 0.0))
                    app.after(0, lambda: app.reset_buttons())
                    return

    for ep in range(start_ep, end_ep + 1):
        if app.controller.cancel_download_flag:
            break

        padded_ep = str(ep)
        matched_href = None
        
        if valid_eps:
            for item in valid_eps:
                if item["ep_num"] == ep:
                    matched_href = item["href"]
                    if matched_href.startswith("/e/"):
                        matched_href = matched_href.split("/e/")[-1]
                    break

        if matched_href:
            target_slug = unquote(matched_href)
        else:
            prefix, suffix = None, None
            padding_length = 2
            if cache and cache.get("prefix") and cache.get("suffix"):
                prefix = cache["prefix"]
                suffix = cache["suffix"]
                padding_length = cache["padding_length"]
            else:
                if not series_url:
                    app.log("Error: Direct execution pipeline broken.")
                    app.after(0, lambda: app.reset_buttons())
                    return

                with playwright.sync_api.sync_playwright() as p:
                    browser = p.chromium.launch(headless=True)
                    context = browser.new_context()
                    page = context.new_page()
                    try:
                        if not series_url.startswith("http"):
                            series_url = f"https://ani.ohli24.com{series_url}" if series_url.startswith("/") else f"https://ani.ohli24.com/{series_url}"
                        app.log("Accessing main episode directory page...")
                        page.goto(series_url, timeout=20000)
                        page.wait_for_timeout(3000)

                        valid_episodes = []
                        episode_links = page.locator("a").evaluate_all("elements => elements.map(e => e.getAttribute('href'))")
                        for href in episode_links:
                            if href and "/e/" in href:
                                decoded = unquote(href).split("/e/")[-1]
                                matches = list(re.finditer(r'\d+', decoded))
                                if matches:
                                    last_match = matches[-1]
                                    try:
                                        valid_episodes.append({
                                            "prefix": decoded[:last_match.start()],
                                            "suffix": decoded[last_match.end():],
                                            "ep_str": last_match.group(),
                                            "ep_val": int(last_match.group())
                                        })
                                    except:
                                        pass

                        if valid_episodes:
                            valid_episodes.sort(key=lambda x: x["ep_val"])
                            prefix = valid_episodes[0]["prefix"]
                            suffix = valid_episodes[0]["suffix"]
                            padding_length = len(valid_episodes[0]["ep_str"])
                            pm.save_anime_cache(anime_title, prefix, suffix, padding_length, series_url)
                    except Exception as e:
                        app.log(f"Browser automation fault: {e}")
                        browser.close()
                        app.after(0, lambda: app.update_progress_ui("Status: Error during analysis", 0.0))
                        app.after(0, lambda: app.reset_buttons())
                        return
                    browser.close()

            if not prefix or not suffix:
                app.log("Failed to decipher text padding rules.")
                app.after(0, lambda: app.update_progress_ui("Status: Parsing failed", 0.0))
                app.after(0, lambda: app.reset_buttons())
                return

            padded_ep = str(ep).zfill(padding_length)
            target_slug = f"{prefix}{padded_ep}{suffix}"

        safe_filename = re.sub(r'\s+', '_', target_slug.strip())
        output_name = os.path.join(anime_folder, f"{safe_filename}.mp4")
        
        if action_type == "watch":
            with playwright.sync_api.sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                process_single_stream(app, page, target_slug, padded_ep)
                browser.close()
            break
        else:
            if os.path.exists(output_name):
                app.log(f"Episode {padded_ep} already exists locally. Skipping network download...")
                continue
            with playwright.sync_api.sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                process_single_download_item(app, page, target_slug, padded_ep, output_name, safe_filename)
                browser.close()

    if action_type == "download":
        if app.controller.cancel_download_flag:
            app.log("DOWNLOAD ABORTED: Cleaning up partial data fragments...")
            time.sleep(1.0)
            if os.path.exists(anime_folder):
                for file_entry in os.listdir(anime_folder):
                    if file_entry.endswith(".part") or file_entry.endswith(".ytdl"):
                        try:
                            os.remove(os.path.join(anime_folder, file_entry))
                        except:
                            pass
            app.after(0, lambda: app.update_progress_ui("Status: Download Cancelled", 0.0))
        else:
            app.after(0, lambda: app.update_progress_ui("Status: All tasks processed successfully!", 100.0))
            
    app.after(0, lambda: app.reset_buttons())

def process_single_stream(app, page, target_slug, padded_ep):
    encoded_slug = target_slug.replace(" ", "%20")
    target_url = f"https://ani.ohli24.com/e/{encoded_slug}"
    
    app.log(f"Analyzing Episode {padded_ep} for streaming...")
    app.after(0, lambda p_ep=padded_ep: app.update_progress_ui(f"Status: Fetching stream token for Ep {p_ep}...", 0.0))
    captured_data = {"link": None}

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
        page.goto(target_url, timeout=20000)
        max_attempts = 15
        attempts = 0
        while not captured_data["link"] and attempts < max_attempts:
            page.wait_for_timeout(1000)
            attempts += 1
    except Exception as e:
        app.log(f"Error loading stream frame: {e}")
    
    page.remove_listener("response", handle_response)

    if captured_data["link"]:
        app.log("Stream link successfully hijacked! Initializing media playback pipeline...")
        app.after(0, lambda p_ep=padded_ep: app.update_progress_ui(f"Status: Playing Episode {p_ep}", 100.0))
        
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        media = app.controller.vlc_instance.media_new(captured_data["link"])
        media.add_option(f":http-user-agent={ua}")
        
        app.controller.vlc_player.set_media(media)
        app.controller.vlc_player.play()
        app.after(0, lambda: app.controller.vlc_player.audio_set_volume(int(app.volume_val)))
    else:
        app.log(f"Streaming failed: Security token allocation timed out.")
        app.after(0, lambda: app.update_progress_ui("Status: Streaming handshake failed", 0.0))

def process_single_download_item(app, page, target_slug, padded_ep, output_name, safe_filename):
    encoded_slug = target_slug.replace(" ", "%20")
    target_url = f"https://ani.ohli24.com/e/{encoded_slug}"
    
    app.log(f"Analyzing Episode {padded_ep}...")
    app.after(0, lambda p_ep=padded_ep: app.update_progress_ui(f"Status: Fetching token for Ep {p_ep}...", 0.0))
    captured_data = {"link": None}

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
        page.goto(target_url, timeout=20000)
        max_attempts = 15
        attempts = 0
        while not captured_data["link"] and attempts < max_attempts:
            if app.controller.cancel_download_flag:
                break
            page.wait_for_timeout(1000)
            attempts += 1
    except Exception as e:
        app.log(f"Error loading stream frame: {e}")
    
    page.remove_listener("response", handle_response)

    if app.controller.cancel_download_flag:
        return

    if captured_data["link"]:
        app.log(f"Stream captured. Downloading file directly...")
        ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        try:
            success = run_yt_dlp_subprocess(
                app, captured_data["link"], output_name, ua, padded_ep, label="Ep"
            )
            if success and not app.controller.cancel_download_flag:
                app.after(0, lambda p_ep=padded_ep: app.update_progress_ui(f"Status: Episode {p_ep} complete!", 100.0))
                app.log(f"Saved: {safe_filename}.mp4")
            elif not success and not app.controller.cancel_download_flag:
                app.log(f"Download failed for Episode {padded_ep} (yt-dlp returned an error).")
        except Exception as download_error:
            app.log(f"Download processing error: {download_error}")
    else:
        app.log(f"Skipping {padded_ep}: Token handshake failed.")