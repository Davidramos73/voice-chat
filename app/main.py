import os
from datetime import datetime, timedelta
from typing import Optional

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Depends, Response
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Voice Chat MVP")

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-key-change-me")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# Hardcoded users
VALID_USERS = {
    "admin": "admin123",
    "Mara": "2026MARA",
}

# Hardcoded system prompt - English Teacher Character
SYSTEM_PROMPT = """You are Maya, a friendly and encouraging English teacher specializing in helping Spanish speakers reach B2 level proficiency.

PERSONALITY:
- Warm, patient, and supportive
- Enthusiastic about helping students improve
- Uses humor occasionally to keep conversations engaging

TEACHING APPROACH:
- Speak naturally in English at a B2-appropriate pace (not too fast, not too slow)
- When the student makes a grammar or pronunciation mistake, gently correct them by naturally rephrasing what they said correctly, then continue the conversation
- Introduce B2-level vocabulary naturally and explain new words briefly when used
- Ask follow-up questions to encourage longer responses
- Praise good use of complex structures or vocabulary

CONVERSATION STYLE:
- Keep responses concise (2-4 sentences typically) since this is voice conversation
- Use varied sentence structures appropriate for B2 level
- Include idioms and phrasal verbs occasionally, explaining them briefly
- If the student speaks in Spanish, kindly encourage them to try in English

TOPICS TO EXPLORE:
- Daily life, hobbies, travel experiences
- Opinions on current events, technology, culture
- Hypothetical situations (what would you do if...)
- Past experiences and future plans

Start by warmly greeting the student and asking what they'd like to practice today."""


class LoginRequest(BaseModel):
    username: str
    password: str


class SDPRequest(BaseModel):
    sdp: str


def create_token(username: str) -> str:
    """Create a JWT token for the user."""
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Verify a JWT token and return the username."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def get_current_user(request: Request) -> Optional[str]:
    """Get the current user from the JWT cookie."""
    token = request.cookies.get("auth_token")
    if not token:
        return None
    return verify_token(token)


def require_auth(request: Request) -> str:
    """Dependency that requires authentication."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Redirect to login or chat based on auth status."""
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/chat", status_code=302)
    return RedirectResponse(url="/login", status_code=302)


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Render the login page."""
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/chat", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request})


@app.post("/api/login")
async def login(login_data: LoginRequest, response: Response):
    """Validate credentials and return JWT."""
    if VALID_USERS.get(login_data.username) == login_data.password:
        token = create_token(login_data.username)
        response = JSONResponse(content={"success": True, "message": "Login successful"})
        response.set_cookie(
            key="auth_token",
            value=token,
            httponly=True,
            max_age=TOKEN_EXPIRE_HOURS * 3600,
            samesite="lax"
        )
        return response
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    """Render the chat page (requires auth)."""
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse("chat.html", {"request": request, "user": user})


@app.post("/api/logout")
async def logout(response: Response):
    """Clear the auth cookie."""
    response = JSONResponse(content={"success": True})
    response.delete_cookie("auth_token")
    return response


@app.get("/api/ephemeral-key")
async def get_ephemeral_key(user: str = Depends(require_auth)):
    """Return OpenAI API key for WebRTC connection."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    return {"api_key": OPENAI_API_KEY}


@app.get("/api/config")
async def get_config(user: str = Depends(require_auth)):
    """Return configuration for the chat client."""
    return {
        "system_prompt": SYSTEM_PROMPT,
        "voice": "coral",
        "model": "gpt-4o-mini-realtime-preview"
    }


@app.post("/api/realtime-proxy")
async def realtime_proxy(sdp_request: SDPRequest, user: str = Depends(require_auth)):
    """Proxy SDP offer to OpenAI Realtime API."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    model = "gpt-4o-mini-realtime-preview"
    url = f"https://api.openai.com/v1/realtime?model={model}"

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/sdp"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                url,
                headers=headers,
                content=sdp_request.sdp,
                timeout=30.0
            )

            if response.status_code != 201:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenAI API error: {response.text}"
                )

            return Response(
                content=response.content,
                media_type="application/sdp"
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="OpenAI API timeout")
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"OpenAI API connection error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
