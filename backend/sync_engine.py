import os
import io
import hashlib
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload
from auth import auth_manager
from mappings import mappings_manager
from settings import settings_manager
from logs import logs_manager

def calculate_md5_safe(filepath):
    hash_md5 = hashlib.md5()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest(), None
    except PermissionError:
        return None, "Locked"
    except Exception as e:
        return None, str(e)

class SyncEngine:
    def __init__(self):
        self.service = None
        self.is_paused = False
        self.cancel_requested = False

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def cancel(self):
        self.cancel_requested = True
        self.is_paused = False

    def reset_interrupts(self):
        self.is_paused = False
        self.cancel_requested = False

    def _check_interrupts(self, progress_callback=None):
        import time
        while self.is_paused:
            if self.cancel_requested:
                raise Exception("Sync cancelled by user.")
            if progress_callback:
                progress_callback(0, 0, "Paused...", mode="paused")
            time.sleep(1)
        if self.cancel_requested:
            raise Exception("Sync cancelled by user.")

    def connect(self):
        """Initializes the Google Drive API client using AuthManager."""
        creds = auth_manager.get_credentials()
        self.service = build('drive', 'v3', credentials=creds)

    def list_remote_folders(self, parent_id="root"):
        """Fetches a list of files and folders from Google Drive."""
        if not self.service:
            self.connect()
        folders = []
        files = []
        
        if parent_id == "root":
            try:
                r1 = self.service.files().list(
                    q="trashed = false and 'root' in parents",
                    pageSize=1000,
                    fields="nextPageToken, files(id, name, mimeType)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()
                for f in r1.get('files', []):
                    f['group'] = 'personal'
                    if f.get('mimeType') == 'application/vnd.google-apps.folder':
                        folders.append(f)
                    else:
                        files.append(f)
                        
                r2 = self.service.files().list(
                    q="trashed = false and sharedWithMe = true",
                    pageSize=1000,
                    fields="nextPageToken, files(id, name, mimeType)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()
                for f in r2.get('files', []):
                    f['group'] = 'shared'
                    if f.get('mimeType') == 'application/vnd.google-apps.folder':
                        folders.append(f)
                    else:
                        files.append(f)
            except Exception as e:
                print(f"Error fetching root files: {e}")
                
            # Fetch Shared Drives (Team Drives)
            try:
                drives_result = self.service.drives().list(pageSize=100).execute()
                for d in drives_result.get('drives', []):
                    folders.append({
                        'id': d['id'],
                        'name': f"☁️ [Shared Drive] {d['name']}",
                        'mimeType': 'application/vnd.google-apps.folder',
                        'group': 'shared'
                    })
            except Exception as e:
                print(f"Error fetching shared drives: {e}")
        else:
            query = f"trashed = false and '{parent_id}' in parents"
            try:
                # Add supportsAllDrives for when parent_id is inside a Shared Drive
                results = self.service.files().list(
                    q=query,
                    pageSize=1000,
                    fields="nextPageToken, files(id, name, mimeType)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()
                for f in results.get('files', []):
                    if f.get('mimeType') == 'application/vnd.google-apps.folder':
                        folders.append(f)
                    else:
                        files.append(f)
            except Exception as e:
                print(f"Error fetching subfolder {parent_id}: {e}")
                
        folders = sorted(folders, key=lambda x: x['name'].lower())
        files = sorted(files, key=lambda x: x['name'].lower())
        return folders + files

    def create_remote_folder(self, name, parent_id="root"):
        """Creates a new folder on Google Drive."""
        if not self.service:
            self.connect()
        
        file_metadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        
        folder = self.service.files().create(
            body=file_metadata,
            fields='id, name',
            supportsAllDrives=True
        ).execute()
        return folder


    def _fetch_tree_recursive(self, folder_id, current_path="", progress_callback=None):
        if progress_callback:
            progress_callback(0, 0, f"...{current_path[-30:] if len(current_path) > 30 else current_path or 'Root'}", mode="scanning")
        query = f"trashed = false and '{folder_id}' in parents"
        results = []
        page_token = None
        while True:
            self._check_interrupts(progress_callback)
            res = self.service.files().list(
                q=query,
                pageSize=1000,
                fields="nextPageToken, files(id, name, mimeType, md5Checksum, parents)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageToken=page_token
            ).execute()
            results.extend(res.get('files', []))
            page_token = res.get('nextPageToken')
            if not page_token:
                break
                
        tree = {}
        for f in results:
            if current_path == "" and f['name'] == '_archive':
                continue
            rel_path = os.path.join(current_path, f['name']).replace("\\", "/")
            tree[rel_path] = f
            if f['mimeType'] == 'application/vnd.google-apps.folder':
                sub_tree = self._fetch_tree_recursive(f['id'], rel_path, progress_callback)
                tree.update(sub_tree)
        return tree

    def _get_or_create_remote_path(self, local_rel_dir, remote_parent_id, folder_cache):
        if not local_rel_dir or local_rel_dir == ".":
            return remote_parent_id
            
        parts = local_rel_dir.replace("\\", "/").split("/")
        current_id = remote_parent_id
        current_path = ""
        
        for part in parts:
            if not part: continue
            current_path = f"{current_path}/{part}" if current_path else part
            
            if current_path in folder_cache:
                current_id = folder_cache[current_path]
            else:
                folder = self.create_remote_folder(part, current_id)
                current_id = folder['id']
                folder_cache[current_path] = current_id
                
        return current_id
        
    def _get_or_create_archive_folder(self, parent_id):
        query = f"trashed = false and '{parent_id}' in parents and name = '_archive' and mimeType = 'application/vnd.google-apps.folder'"
        res = self.service.files().list(q=query, fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        files = res.get('files', [])
        if files:
            return files[0]['id']
        return self.create_remote_folder('_archive', parent_id)['id']
        
    def _archive_file(self, file_dict, archive_folder_id, remote_parent_id):
        import time
        original_name = file_dict['name']
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(original_name)
        new_name = f"{name}_{timestamp}{ext}"
        
        self.service.files().update(
            fileId=file_dict['id'],
            addParents=archive_folder_id,
            removeParents=remote_parent_id,
            body={'name': new_name},
            supportsAllDrives=True
        ).execute()
        
        query = f"trashed = false and '{archive_folder_id}' in parents and name contains '{name}_'"
        res = self.service.files().list(q=query, fields="files(id, name, createdTime)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        archived_files = res.get('files', [])
        archived_files.sort(key=lambda x: x.get('name', ''))
        
        while len(archived_files) > 7:
            oldest = archived_files.pop(0)
            self.service.files().delete(fileId=oldest['id'], supportsAllDrives=True).execute()

    def get_remote_tree(self, mapping_id):
        if not self.service:
            self.connect()
        mappings = mappings_manager.get_all()
        mapping = next((m for m in mappings if m['id'] == mapping_id), None)
        if not mapping:
            return []
            
        tree = self._fetch_tree_recursive(mapping['remote_folder_id'])
        return [{"path": k, "id": v['id'], "mimeType": v['mimeType']} for k, v in tree.items()]

    def run_sync(self, progress_callback=None, mapping_id=None):
        self.reset_interrupts()
        if not self.service:
            self.connect()
            
        mappings = mappings_manager.get_all()
        if mapping_id:
            mappings = [m for m in mappings if m['id'] == mapping_id]
            
        synced_files = []
        failed_files = []
        
        settings = settings_manager.get_all()
        exclusions = settings.get("exclude_extensions", [])
        folder_exclusions = settings.get("exclude_folders", [".git", ".venv", "node_modules"])
        
        total_files = 0
        workload = []
        for mapping in mappings:
            local_dir = mapping['local_path']
            if os.path.exists(local_dir):
                local_files = []
                for root, dirs, files in os.walk(local_dir):
                    # Modify dirs in-place to prevent os.walk from descending into excluded folders
                    dirs[:] = [d for d in dirs if d not in folder_exclusions]
                    
                    self._check_interrupts(progress_callback)
                    if progress_callback:
                        progress_callback(0, 0, f"Scanning: {root[-40:] if len(root) > 40 else root}", mode="scanning")
                    for f in files:
                        if not any(f.endswith(ext) for ext in exclusions):
                            local_files.append(os.path.relpath(os.path.join(root, f), local_dir))
                total_files += len(local_files)
                workload.append((mapping, local_files))

        processed = 0

        for mapping, files in workload:
            local_dir = mapping['local_path']
            remote_parent_id = mapping['remote_folder_id']
            
            remote_tree = self._fetch_tree_recursive(remote_parent_id, progress_callback=progress_callback)
            folder_cache = {path: f['id'] for path, f in remote_tree.items() if f['mimeType'] == 'application/vnd.google-apps.folder'}
                
            for rel_path in files:
                self._check_interrupts(progress_callback)
                filepath = os.path.join(local_dir, rel_path)
                filename = os.path.basename(filepath)
                rel_dir = os.path.dirname(rel_path).replace("\\", "/")
                
                if progress_callback:
                    progress_callback(processed, total_files, filename)

                local_md5, md5_err = calculate_md5_safe(filepath)
                if md5_err:
                    failed_files.append({"name": rel_path, "reason": md5_err})
                    processed += 1
                    if progress_callback: progress_callback(processed, total_files, filename)
                    continue

                remote_file = remote_tree.get(rel_path.replace("\\", "/"))
                
                if remote_file and remote_file.get('md5Checksum') == local_md5:
                    processed += 1
                    if progress_callback:
                        progress_callback(processed, total_files, filename)
                    continue
                    
                target_parent_id = self._get_or_create_remote_path(rel_dir, remote_parent_id, folder_cache)
                file_id = remote_file['id'] if remote_file else None
                try:
                    self.upload_file(filepath, filename, target_parent_id, file_id)
                    synced_files.append(rel_path)
                except Exception as e:
                    failed_files.append({"name": rel_path, "reason": str(e)})
                
                processed += 1
                if progress_callback:
                    progress_callback(processed, total_files, filename)
                    
            # Archive deleted local files
            local_rel_paths_set = set(f.replace("\\", "/") for f in files)
            for r_path, r_file in remote_tree.items():
                if r_file['mimeType'] != 'application/vnd.google-apps.folder' and r_path not in local_rel_paths_set:
                    try:
                        archive_folder_id = self._get_or_create_archive_folder(remote_parent_id)
                        parent_folder_id = r_file.get('parents', [remote_parent_id])[0]
                        self._archive_file(r_file, archive_folder_id, parent_folder_id)
                    except Exception as e:
                        print(f"Error archiving {r_path}: {e}")
                    
        logs_manager.append_log("Push", "Success", total_files, len(synced_files), len(failed_files), "")
        return synced_files, failed_files

    def run_restore(self, progress_callback=None, mapping_id=None):
        self.reset_interrupts()
        if not self.service:
            self.connect()
            
        mappings = mappings_manager.get_all()
        if mapping_id:
            mappings = [m for m in mappings if m['id'] == mapping_id]
            
        restored_files = []
        failed_files = []
        settings = settings_manager.get_all()
        exclusions = settings.get("exclude_extensions", [])
        
        workload = []
        total_files = 0
        
        for mapping in mappings:
            local_dir = mapping['local_path']
            remote_parent_id = mapping['remote_folder_id']
            
            if not os.path.exists(local_dir):
                os.makedirs(local_dir, exist_ok=True)
                
            remote_tree = self._fetch_tree_recursive(remote_parent_id, progress_callback=progress_callback)
            
            remote_files = []
            for path, f in remote_tree.items():
                if f['mimeType'] != 'application/vnd.google-apps.folder' and not any(f['name'].endswith(ext) for ext in exclusions):
                    remote_files.append((path, f))
                    
            total_files += len(remote_files)
            workload.append((mapping, remote_files))
            
        processed = 0
        for mapping, remote_files in workload:
            local_dir = mapping['local_path']
            
            for rel_path, rf in remote_files:
                self._check_interrupts(progress_callback)
                filename = rf['name']
                filepath = os.path.join(local_dir, rel_path)
                remote_md5 = rf.get('md5Checksum')
                
                if progress_callback:
                    progress_callback(processed, total_files, filename)
                    
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                
                local_md5, md5_err = calculate_md5_safe(filepath) if os.path.isfile(filepath) else (None, None)
                if md5_err:
                    failed_files.append({"name": rel_path, "reason": md5_err})
                    processed += 1
                    if progress_callback: progress_callback(processed, total_files, filename)
                    continue
                
                if local_md5 and local_md5 == remote_md5:
                    processed += 1
                    if progress_callback:
                        progress_callback(processed, total_files, filename)
                    continue
                    
                try:
                    request = self.service.files().get_media(fileId=rf['id'], supportsAllDrives=True)
                    with open(filepath, "wb") as f:
                        downloader = MediaIoBaseDownload(f, request)
                        done = False
                        while done is False:
                            status, done = downloader.next_chunk()
                    restored_files.append(rel_path)
                except Exception as e:
                    failed_files.append({"name": rel_path, "reason": str(e)})
                processed += 1
                if progress_callback:
                    progress_callback(processed, total_files, filename)
                    
        logs_manager.append_log("Restore", "Success", total_files, len(restored_files), len(failed_files), "")
        return restored_files, failed_files
        
    def run_selective_restore(self, mapping_id, file_ids, progress_callback=None):
        self.reset_interrupts()
        if not self.service:
            self.connect()
            
        mappings = mappings_manager.get_all()
        mapping = next((m for m in mappings if m['id'] == mapping_id), None)
        if not mapping:
            return [], []
            
        local_dir = mapping['local_path']
        if not os.path.exists(local_dir):
            os.makedirs(local_dir, exist_ok=True)
            
        remote_tree = self._fetch_tree_recursive(mapping['remote_folder_id'], progress_callback=progress_callback)
        
        restored_files = []
        failed_files = []
        total_files = len(file_ids)
        processed = 0
        
        file_ids_set = set(file_ids)
        for rel_path, rf in remote_tree.items():
            self._check_interrupts(progress_callback)
            if rf['id'] in file_ids_set and rf['mimeType'] != 'application/vnd.google-apps.folder':
                filename = rf['name']
                filepath = os.path.join(local_dir, rel_path)
                
                if progress_callback:
                    progress_callback(processed, total_files, filename)
                    
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                try:
                    request = self.service.files().get_media(fileId=rf['id'], supportsAllDrives=True)
                    with open(filepath, "wb") as f:
                        downloader = MediaIoBaseDownload(f, request)
                        done = False
                        while done is False:
                            status, done = downloader.next_chunk()
                    restored_files.append(rel_path)
                except Exception as e:
                    failed_files.append({"name": rel_path, "reason": str(e)})
                processed += 1
                if progress_callback:
                    progress_callback(processed, total_files, filename)
                    
        return restored_files, failed_files

    def upload_file(self, local_path, file_name, parent_id, file_id=None):
        """Uploads a file to Google Drive, updating if it already exists."""
        if not self.service:
            self.connect()

        media = MediaFileUpload(local_path, resumable=True)

        if file_id:
            # File exists, update it
            self.service.files().update(
                fileId=file_id,
                media_body=media,
                supportsAllDrives=True
            ).execute()
        else:
            # File does not exist, create it
            file_metadata = {
                'name': file_name,
                'parents': [parent_id]
            }
            self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id',
                supportsAllDrives=True
            ).execute()

sync_engine = SyncEngine()
