import os
import time

class EvictionEngine:
    def __init__(self, initial_dirs=None):
        pass # Directory lists are passed at runtime now

    def run_eviction(self, local_dirs, days_threshold=30, exclusions=None):
        """Scans the provided local directories and deletes files unaccessed for > days_threshold."""
        if exclusions is None:
            exclusions = []
            
        try:
            days_threshold = int(days_threshold)
        except (ValueError, TypeError):
            days_threshold = 30
            
        now = time.time()
        cutoff_time = now - (days_threshold * 86400) # 86400 seconds in a day
        
        evicted_files = []
        bytes_saved = 0

        for sync_dir in local_dirs:
            if not os.path.exists(sync_dir):
                continue

            for root, dirs, files in os.walk(sync_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                
                    # Exclude hidden files or matched extensions
                    if file.startswith('.') or any(file.endswith(ext) for ext in exclusions):
                        continue
                
                    try:
                        stat_info = os.stat(file_path)
                        # Use atime (access time) or mtime (modified time) depending on OS support
                        # Windows atime is sometimes unreliable unless enabled in registry,
                        # but we'll use mtime/atime whichever is older as a fallback
                        last_accessed = max(stat_info.st_atime, stat_info.st_mtime)
                        
                        if last_accessed < cutoff_time:
                            file_size = stat_info.st_size
                            os.remove(file_path)
                            evicted_files.append(file)
                            bytes_saved += file_size
                    except Exception as e:
                        print(f"Failed to check/evict {file_path}: {e}")
                    
        return {
            "status": "success",
            "evicted_count": len(evicted_files),
            "bytes_saved": bytes_saved,
            "evicted_files": evicted_files
        }
