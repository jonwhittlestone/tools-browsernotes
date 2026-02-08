from server.auth import COOKIE_NAME


def test_health_no_auth_required(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_index_redirects_to_login_when_unauthenticated(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


def test_login_page_renders(client):
    response = client.get("/login")
    assert response.status_code == 200
    assert "Browser Notes" in response.text
    assert 'name="password"' in response.text


def test_login_with_correct_password(client):
    response = client.post(
        "/login",
        data={"password": "test-password"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/"
    assert COOKIE_NAME in response.cookies


def test_login_with_wrong_password(client):
    response = client.post(
        "/login",
        data={"password": "wrong-password"},
        follow_redirects=False,
    )
    assert response.status_code == 401
    assert "Incorrect password" in response.text


def test_session_cookie_persists_across_requests(client):
    # Login
    client.post("/login", data={"password": "test-password"})
    # Access protected route
    response = client.get("/", follow_redirects=False)
    # Should not redirect (authenticated)
    assert response.status_code == 200


def test_logout_clears_session(client):
    # Login
    client.post("/login", data={"password": "test-password"})
    # Logout
    client.post("/logout", follow_redirects=False)
    # Should redirect to login now
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


def test_login_page_redirects_when_already_authenticated(authed_client):
    response = authed_client.get("/login", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/"


def test_static_requires_auth(client):
    response = client.get("/static/app.js", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"
