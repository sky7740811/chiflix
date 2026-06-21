import sys
import os

vlc_installed = False
vlc_module = None

try:
    if sys.platform == "win32":
        src_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(src_dir)
        
        if os.path.exists(os.path.join(project_root, "libvlc.dll")):
            os.add_dll_directory(project_root)
        else:
            vlc_default_path = r"C:\Program Files\VideoLAN\VLC"
            if os.path.exists(vlc_default_path):
                os.add_dll_directory(vlc_default_path)
                
    import vlc
    vlc_module = vlc
    vlc_installed = True
except Exception:
    pass