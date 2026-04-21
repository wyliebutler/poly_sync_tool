import json
from googleapiclient.discovery import build
import sys, os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from auth import auth_manager

creds = auth_manager.get_credentials()
service = build('drive', 'v3', credentials=creds)

print("--- SHARED WITH ME FOLDERS ---")
try:
    r1 = service.files().list(q="sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder'", pageSize=10).execute()
    for f in r1.get('files', []):
        print(f['name'], "-", f['id'])
except Exception as e:
    print("Error:", e)

print("\n--- SHARED DRIVES (TEAM DRIVES) ---")
try:
    r2 = service.drives().list(pageSize=10).execute()
    for d in r2.get('drives', []):
        print(d['name'], "-", d['id'])
except Exception as e:
    print("Error:", e)
