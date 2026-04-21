import json
import os
from datetime import datetime, timedelta
from pathlib import Path

APP_DIR = Path.home() / ".polyunity_sync"
APP_DIR.mkdir(parents=True, exist_ok=True)
LOGS_FILE = APP_DIR / "sync_logs.json"

class LogsManager:
    def append_log(self, operation, status, mapped_files_count, success_count, fail_count, errors=""):
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "status": status,
            "total_marked": mapped_files_count,
            "success_count": success_count,
            "fail_count": fail_count,
            "errors": errors
        }
        
        logs = self.get_all()
        logs.insert(0, log_entry)
        
        # Keep logs only within the last 14 days and limit hard cap to 500 lines so it never bloats
        cutoff = datetime.now() - timedelta(days=14)
        
        valid_logs = []
        for l in logs:
            try:
                if datetime.fromisoformat(l['timestamp']) >= cutoff:
                    valid_logs.append(l)
            except Exception:
                pass # Unparseable datetime or structure
                
        logs = valid_logs[:500]
        
        try:
            with open(LOGS_FILE, 'w') as f:
                json.dump(logs, f, indent=2)
        except Exception as e:
            print(f"Error saving log: {e}")

    def get_all(self):
        if not os.path.exists(LOGS_FILE):
            return []
        try:
            with open(LOGS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return []

logs_manager = LogsManager()
