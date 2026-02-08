from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from fastapi import Request, Response
from server.config import SECRET_KEY, COOKIE_MAX_AGE

COOKIE_NAME = "browsernotes_session"

_serializer = URLSafeTimedSerializer(SECRET_KEY)


def create_session_cookie(response: Response) -> None:
    token = _serializer.dumps({"authenticated": True})
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True when behind HTTPS via Traefik
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME)


def is_authenticated(request: Request) -> bool:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return False
    try:
        data = _serializer.loads(token, max_age=COOKIE_MAX_AGE)
        return data.get("authenticated") is True
    except (BadSignature, SignatureExpired):
        return False
