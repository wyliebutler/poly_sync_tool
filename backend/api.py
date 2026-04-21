from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from pydantic import BaseModel
import uvicorn
import os
import sys
from auth import auth_manager
from sync_engine import sync_engine
from eviction_engine import EvictionEngine
from mappings import mappings_manager
from settings import settings_manager
from logs import logs_manager
import asyncio
import concurrent.futures
from typing import List
import time

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Polyunity Sync App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MappingCreate(BaseModel):
    local_path: str
    remote_folder_id: str
    remote_folder_name: str
    name: str = ""

class FolderCreate(BaseModel):
    name: str
    parent_id: str = "root"

class SettingsUpdate(BaseModel):
    sync_interval_minutes: int
    eviction_days_threshold: int
    exclude_extensions: List[str]

class SyncOptions(BaseModel):
    mapping_id: str = None

class SelectiveRestoreOptions(BaseModel):
    mapping_id: str
    file_ids: List[str]

evictor = EvictionEngine([]) # Will be configured dynamically later

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Polyunity Sync Backend is running."}

@app.get("/auth/status")
def auth_status():
    creds = auth_manager._load_credentials_from_keyring()
    if creds and creds.valid:
        return {"authenticated": True, "domain_verified": True}
    return {"authenticated": False}

@app.get("/auth/login")
def auth_login():
    try:
        auth_manager.get_credentials()
        return {"status": "success", "message": "Successfully authenticated."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/auth/logout")
def auth_logout():
    auth_manager.logout()
    return {"status": "success", "message": "Logged out and wiped credentials."}

@app.get("/mappings")
def get_mappings():
    return mappings_manager.get_all()

@app.get("/settings")
def get_settings():
    return settings_manager.get_all()

@app.post("/settings")
def update_settings(settings: SettingsUpdate):
    try:
        new_settings = settings_manager.update({
            "sync_interval_minutes": settings.sync_interval_minutes,
            "eviction_days_threshold": settings.eviction_days_threshold,
            "exclude_extensions": settings.exclude_extensions
        })
        return {"status": "success", "settings": new_settings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/mappings")
def create_mapping(mapping: MappingCreate):
    # Basic validation
    if not os.path.isdir(mapping.local_path):
        raise HTTPException(status_code=400, detail="Local path is not a valid directory.")
    new_mapping = mappings_manager.add(mapping.local_path, mapping.remote_folder_id, mapping.remote_folder_name, mapping.name)
    return new_mapping

@app.delete("/mappings/{mapping_id}")
def delete_mapping(mapping_id: str):
    success = mappings_manager.remove(mapping_id)
    if not success:
        raise HTTPException(status_code=404, detail="Mapping not found.")
    return {"status": "success"}

@app.get("/folders/local")
def list_local_folders(path: str = Query(default=None)):
    if not path:
        if sys.platform == "win32":
            drives = [f"{d}:\\" for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if os.path.exists(f"{d}:\\")]
            return {"current": "", "folders": [{"name": d, "path": d, "mimeType": "application/vnd.google-apps.folder"} for d in drives]}
        else:
            roots = [{"name": "System Root (/)", "path": "/", "mimeType": "application/vnd.google-apps.folder"}]
            user_home = os.path.expanduser("~")
            if os.path.exists(user_home):
                roots.append({"name": f"Home ({user_home})", "path": user_home, "mimeType": "application/vnd.google-apps.folder"})
            if os.path.exists("/Volumes"):
                try:
                    for item in os.listdir("/Volumes"):
                        if not item.startswith("."):
                            full_path = os.path.join("/Volumes", item)
                            if os.path.isdir(full_path):
                                roots.append({"name": f"Volume: {item}", "path": full_path, "mimeType": "application/vnd.google-apps.folder"})
                except PermissionError:
                    pass
            return {"current": "", "folders": roots}
    
    if not os.path.exists(path) or not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Directory not found.")
        
    try:
        folders = []
        files = []
        for item in os.listdir(path):
            full_path = os.path.join(path, item)
            if os.path.isdir(full_path):
                folders.append({"name": item, "path": full_path, "mimeType": "application/vnd.google-apps.folder"})
            else:
                files.append({"name": item, "path": full_path, "mimeType": "file"})
        return {"current": path, "folders": sorted(folders, key=lambda x: x["name"].lower()) + sorted(files, key=lambda x: x["name"].lower())}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied to access this directory.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/folders/remote")
def list_remote_folders(parent_id: str = Query(default="root")):
    try:
        folders = sync_engine.list_remote_folders(parent_id)
        return {"current_id": parent_id, "folders": folders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/folders/remote")
def create_remote_folder(folder: FolderCreate):
    try:
        new_folder = sync_engine.create_remote_folder(folder.name, folder.parent_id)
        return {"status": "success", "folder": new_folder}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)
loop_ref = None
connected_websockets: List[WebSocket] = []

@app.on_event("startup")
async def startup_event():
    global loop_ref
    loop_ref = asyncio.get_running_loop()


@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_websockets.remove(websocket)

last_progress_update = 0

def progress_callback(processed: int, total: int, current_file: str, mode: str = None):
    global last_progress_update
    if not connected_websockets or not loop_ref:
        return
        
    current_time = time.time()
    # Always let final 100% or scanning modes through, but throttle standard fast-paced file hashing updates
    if mode != "scanning" and processed < total and current_time - last_progress_update < 0.15:
        return
        
    last_progress_update = current_time

    if mode:
        payload = {"mode": mode, "current": current_file}
    else:
        payload = {"progress": int((processed / total) * 100) if total > 0 else 100, "current": current_file}
    for ws in connected_websockets:
        if ws.client_state == WebSocketState.CONNECTED:
            asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)

def background_sync(mapping_id):
    try:
        synced_files, failed_files = sync_engine.run_sync(progress_callback, mapping_id)
        if loop_ref:
            payload = {
                "status": "complete_push",
                "success_count": len(synced_files),
                "failed_count": len(failed_files)
            }
            for ws in connected_websockets:
                if ws.client_state == WebSocketState.CONNECTED:
                    asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)
    except Exception as e:
        logs_manager.append_log("Push", "Error", 0, 0, 0, str(e))
        if loop_ref:
            payload = {"status": "error", "message": str(e)}
            for ws in connected_websockets:
                if ws.client_state == WebSocketState.CONNECTED:
                    asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)

def background_restore(mapping_id):
    try:
        restored_files, failed_files = sync_engine.run_restore(progress_callback, mapping_id)
        if loop_ref:
            payload = {
                "status": "complete_restore",
                "success_count": len(restored_files),
                "failed_count": len(failed_files)
            }
            for ws in connected_websockets:
                if ws.client_state == WebSocketState.CONNECTED:
                    asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)
    except Exception as e:
        logs_manager.append_log("Restore", "Error", 0, 0, 0, str(e))
        if loop_ref:
            payload = {"status": "error", "message": str(e)}
            for ws in connected_websockets:
                if ws.client_state == WebSocketState.CONNECTED:
                    asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)

def background_selective_restore(mapping_id, file_ids):
    try:
        restored_files, failed_files = sync_engine.run_selective_restore(mapping_id, file_ids, progress_callback)
        if loop_ref:
            payload = {
                "status": "complete_restore",
                "success_count": len(restored_files),
                "failed_count": len(failed_files)
            }
            for ws in connected_websockets:
                if ws.client_state == WebSocketState.CONNECTED:
                    asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)
    except Exception as e:
        logs_manager.append_log("Selective Restore", "Error", 0, 0, 0, str(e))
        if loop_ref:
            payload = {"status": "error", "message": str(e)}
            for ws in connected_websockets:
                if ws.client_state == WebSocketState.CONNECTED:
                    asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop_ref)

@app.get("/sync/status")
def sync_status():
    try:
        mappings = mappings_manager.get_all()
        return {"status": "idle", "mappings_count": len(mappings)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/sync/push")
async def sync_push(options: SyncOptions = None):
    mapping_id = options.mapping_id if options else None
    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, background_sync, mapping_id)
    return {"status": "started"}

@app.post("/sync/restore")
async def sync_restore(options: SyncOptions = None):
    mapping_id = options.mapping_id if options else None
    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, background_restore, mapping_id)
    return {"status": "started"}

@app.get("/sync/remote_tree")
def get_remote_tree(mapping_id: str):
    from sync_engine import sync_engine
    tree = sync_engine.get_remote_tree(mapping_id)
    return tree

@app.post("/sync/restore_selective")
async def restore_selective(options: SelectiveRestoreOptions):
    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, background_selective_restore, options.mapping_id, options.file_ids)
    return {"status": "started"}

@app.post("/sync/pause")
def sync_pause():
    sync_engine.pause()
    return {"status": "paused"}

@app.post("/sync/resume")
def sync_resume():
    sync_engine.resume()
    return {"status": "resumed"}

@app.post("/sync/stop")
def sync_stop():
    sync_engine.cancel()
    return {"status": "stopped"}

@app.get("/logs")
def get_logs():
    return logs_manager.get_all()

@app.post("/sync/evict")
def sync_evict():
    mappings = mappings_manager.get_all()
    local_dirs = [m['local_path'] for m in mappings if os.path.exists(m['local_path'])]
    
    settings = settings_manager.get_all()
    days = settings.get("eviction_days_threshold", 30)
    exclusions = settings.get("exclude_extensions", [])
    
    result = evictor.run_eviction(local_dirs, days_threshold=days, exclusions=exclusions)
    return result

async def auto_sync_task():
    while True:
        try:
            settings = settings_manager.get_all()
            interval = settings.get("sync_interval_minutes", 0)
            
            if interval > 0:
                print(f"Running automated background sync & evict (interval: {interval} min)")
                # Run sync
                await asyncio.get_event_loop().run_in_executor(executor, sync_engine.run_sync, progress_callback)
                # Run evict
                mappings = mappings_manager.get_all()
                local_dirs = [m['local_path'] for m in mappings if os.path.exists(m['local_path'])]
                days = settings.get("eviction_days_threshold", 30)
                exclusions = settings.get("exclude_extensions", [])
                evictor.run_eviction(local_dirs, days_threshold=days, exclusions=exclusions)
                
                await asyncio.sleep(interval * 60)
            else:
                # If disabled, check again in 1 minute
                await asyncio.sleep(60)
        except Exception as e:
            print(f"Auto sync error: {e}")
            await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    global loop_ref
    loop_ref = asyncio.get_running_loop()
    asyncio.create_task(auto_sync_task())

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
