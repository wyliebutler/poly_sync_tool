import json
import os
import uuid
from pathlib import Path

APP_DIR = Path.home() / ".polyunity_sync"
APP_DIR.mkdir(parents=True, exist_ok=True)
MAPPINGS_FILE = APP_DIR / "mappings.json"

class MappingsManager:
    def __init__(self):
        self.mappings = self._load()

    def _load(self):
        if not os.path.exists(MAPPINGS_FILE):
            return []
        try:
            with open(MAPPINGS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self):
        with open(MAPPINGS_FILE, 'w') as f:
            json.dump(self.mappings, f, indent=2)

    def get_all(self):
        return self.mappings

    def add(self, local_path, remote_folder_id, remote_folder_name, name=""):
        mapping = {
            "id": str(uuid.uuid4()),
            "name": name,
            "local_path": local_path,
            "remote_folder_id": remote_folder_id,
            "remote_folder_name": remote_folder_name
        }
        self.mappings.append(mapping)
        self._save()
        return mapping

    def remove(self, mapping_id):
        initial_len = len(self.mappings)
        self.mappings = [m for m in self.mappings if m['id'] != mapping_id]
        if len(self.mappings) < initial_len:
            self._save()
            return True
        return False

mappings_manager = MappingsManager()
