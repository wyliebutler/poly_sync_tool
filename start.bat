cd backend
venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000 > uvicorn_log.txt 2>&1
