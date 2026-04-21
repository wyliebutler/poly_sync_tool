import json
import os
from pathlib import Path

APP_DIR = Path.home() / ".polyunity_sync"
APP_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = APP_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "sync_interval_minutes": 0,
    "eviction_days_threshold": 30,
    "exclude_extensions": [".tmp", ".log", ".download"],
    "exclude_folders": [".git", ".venv", "node_modules"]
}

class SettingsManager:
    def __init__(self):
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        if not os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(DEFAULT_SETTINGS, f, indent=4)

    def get_all(self):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return DEFAULT_SETTINGS

    def update(self, new_settings):
        current = self.get_all()
        current.update(new_settings)
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(current, f, indent=4)
        return current

settings_manager = SettingsManager()
