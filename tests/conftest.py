import os
import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["AUTH_PASSWORD"] = "test-password"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["DATA_DIR"] = "/tmp/browsernotes-test-data"

from server.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def authed_client(client):
    """A client that is already authenticated."""
    client.post("/login", data={"password": "test-password"})
    return client
