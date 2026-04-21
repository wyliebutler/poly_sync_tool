import os
import json
import keyring
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import jwt

# If modifying these scopes, delete the saved credentials
SCOPES = ['https://www.googleapis.com/auth/drive', 'openid', 'https://www.googleapis.com/auth/userinfo.email']

CREDENTIALS_FILE = 'client_secrets.json'
KEYRING_SERVICE_NAME = 'PolyunitySyncApp'
KEYRING_ACCOUNT_NAME = 'google_oauth_token'

class AuthManager:
    def __init__(self):
        self.credentials = None

    def get_credentials(self):
        """Retrieves and refreshes existing credentials or initiates a new OAuth flow."""
        self.credentials = self._load_credentials_from_keyring()

        if self.credentials and self.credentials.expired and self.credentials.refresh_token:
            print("Refreshing expired token...")
            try:
                self.credentials.refresh(Request())
                self._save_credentials_to_keyring(self.credentials)
            except Exception as e:
                print(f"Failed to refresh token: {e}")
                self.credentials = None

        if not self.credentials or not self.credentials.valid:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(f"Missing {CREDENTIALS_FILE}. Please download it from Google Cloud Console.")
            
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            # Ensure zero-touch login by forcing the hd (hosted domain) parameter
            # Note: the user can still bypass this in the UI, so we must verify the token later
            self.credentials = flow.run_local_server(
                port=0,
                prompt='consent',
                authorization_prompt_message='Please authorize the Polyunity Sync App.',
                kwargs={'hd': 'polyunity.com'}
            )
            
            # Verify domain
            if not self._verify_domain(self.credentials):
                self.logout()
                raise PermissionError("Access denied. Must be a @polyunity.com account.")

            self._save_credentials_to_keyring(self.credentials)

        return self.credentials

    def _verify_domain(self, credentials):
        """Verifies that the authenticated user belongs to polyunity.com"""
        try:
            # We can decode the ID token to check the hd claim
            if hasattr(credentials, 'id_token') and credentials.id_token:
                decoded = jwt.decode(credentials.id_token, options={"verify_signature": False})
                if decoded.get('hd') == 'polyunity.com':
                    return True
                print(f"Unauthorized domain: {decoded.get('hd')}")
            return False
        except Exception as e:
            print(f"Error verifying domain: {e}")
            return False

    def _save_credentials_to_keyring(self, creds):
        """Stores credentials securely in the OS keyring, with file fallback if denied."""
        creds_json = creds.to_json()
        try:
            keyring.set_password(KEYRING_SERVICE_NAME, KEYRING_ACCOUNT_NAME, creds_json)
        except Exception as e:
            print(f"Keychain denied. Using fallback: {e}")
            fallback_path = os.path.expanduser("~/.polyunity_sync_token.json")
            try:
                with open(fallback_path, "w") as f:
                    f.write(creds_json)
            except Exception as fe:
                print(f"Fallback storage error: {fe}")

    def _load_credentials_from_keyring(self):
        """Loads credentials from the OS keyring or fallback file."""
        creds_json = None
        try:
            creds_json = keyring.get_password(KEYRING_SERVICE_NAME, KEYRING_ACCOUNT_NAME)
        except Exception as e:
            print(f"Keychain load denied: {e}")
            
        if not creds_json:
            fallback_path = os.path.expanduser("~/.polyunity_sync_token.json")
            if os.path.exists(fallback_path):
                try:
                    with open(fallback_path, "r") as f:
                        creds_json = f.read()
                except Exception as e:
                    pass
                    
        if creds_json:
            try:
                creds_dict = json.loads(creds_json)
                return Credentials.from_authorized_user_info(creds_dict, SCOPES)
            except Exception as e:
                print(f"Error loading credentials payload: {e}")
        return None

    def logout(self):
        """Deletes the stored credentials, wiping local access."""
        try:
            keyring.delete_password(KEYRING_SERVICE_NAME, KEYRING_ACCOUNT_NAME)
        except Exception:
            pass
        fallback_path = os.path.expanduser("~/.polyunity_sync_token.json")
        if os.path.exists(fallback_path):
            try:
                os.remove(fallback_path)
            except:
                pass
        self.credentials = None

auth_manager = AuthManager()
