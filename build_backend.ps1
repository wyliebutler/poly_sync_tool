cd "C:\POLYUNITY_SYNC_APP\backend"
.\venv2\Scripts\python.exe -m pip install pyinstaller fastapi uvicorn pydantic keyring google-auth google-auth-oauthlib google-api-python-client PyJWT --progress-bar off
.\venv2\Scripts\pyinstaller.exe --name polyunity_sync_daemon --onefile --noconsole --hidden-import=jwt --hidden-import=uvicorn.loops --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols --hidden-import=uvicorn.protocols.http --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.protocols.websockets --hidden-import=uvicorn.protocols.websockets.auto --hidden-import=uvicorn.lifespan --hidden-import=uvicorn.lifespan.on --hidden-import=uvicorn.logging api.py

