import asyncio
import websockets
import json
import requests
import sys

async def test_ws():
    async with websockets.connect("ws://127.0.0.1:8001/ws/progress") as ws:
        print("Connected to WebSocket. Triggering sync push...")
        
        # Trigger the sync via REST
        try:
            res = requests.post("http://127.0.0.1:8001/sync/push", json={"mapping_id": "46d1564f-0904-4a58-b299-037cc7538d28"})
            print(f"Push triggred: {res.json()}")
        except Exception as e:
            print(f"Error triggering push: {e}")
            return
            
        print("Listening for messages...")
        try:
            while True:
                message = await asyncio.wait_for(ws.recv(), timeout=20.0)
                print(f"Received from WS: {message}")
                data = json.loads(message)
                if data.get("status") in ["complete_push", "complete_restore", "error"]:
                    print("Finished.")
                    break
        except asyncio.TimeoutError:
            print("Timeout waiting for messages!")

if __name__ == "__main__":
    asyncio.run(test_ws())
