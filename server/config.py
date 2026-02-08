import os

AUTH_PASSWORD = os.environ.get("AUTH_PASSWORD", "")
SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
DROPBOX_APP_KEY = os.environ.get("DROPBOX_APP_KEY", "")
DROPBOX_REDIRECT_URI = os.environ.get(
    "DROPBOX_REDIRECT_URI",
    "https://howapped.zapto.org/browsernotes/api/dropbox/callback",
)
PORT = int(os.environ.get("PORT", "3004"))
DATA_DIR = os.environ.get("DATA_DIR", "./data")
ROOT_PATH = os.environ.get("ROOT_PATH", "")
COOKIE_MAX_AGE = 90 * 24 * 60 * 60  # 90 days in seconds
