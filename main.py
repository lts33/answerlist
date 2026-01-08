import os
import json
import logging
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Depends, Header, status, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import Json
from passlib.context import CryptContext
from jose import JWTError, jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# --- Configuration ---
DATABASE_URL = os.environ.get("DATABASE_URL")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
SECRET_KEY = os.environ.get("SECRET_KEY", "openthiswall")  # Change in production!
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 30

app = FastAPI()

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database ---
def get_db_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable not set")
    return psycopg2.connect(DATABASE_URL)

# --- Security & Auth ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = None # We use custom bearer token extraction

class Token(BaseModel):
    access_token: str
    token_type: str
    username: Optional[str] = None
    is_new: bool = False

class TokenData(BaseModel):
    user_id: int
    email: str

class UserCreate(BaseModel):
    username: str
    password: str

class UserUpdate(BaseModel):
    username: str

class InterviewEntry(BaseModel):
    question: str
    answer: str
    category: str = "General"
    info_b: Optional[str] = None

class GoogleAuthRequest(BaseModel):
    credential: str

# --- Dependency ---
def get_current_user_id(authorization: str = Header(None)) -> int:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        scheme, token = authorization.split()
        if scheme.lower() != 'bearer':
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Authorization Scheme",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization Header Format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# --- Helper Functions ---
def create_access_token(data: dict):
    to_encode = data.copy()
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# --- Endpoints ---

@app.get("/auth/config")
def auth_config():
    return {"google_client_id": GOOGLE_CLIENT_ID}

@app.post("/auth/google", response_model=Token)
def login_google(auth_request: GoogleAuthRequest):
    token = auth_request.credential
    try:
        # Verify the Google Token
        id_info = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)

        email = id_info['email']
        # sub = id_info['sub'] # Google user ID

        conn = get_db_conn()
        with conn.cursor() as cur:
            # Check if user exists by email
            cur.execute("SELECT id, username FROM users WHERE email = %s", (email,))
            user = cur.fetchone()

            is_new = False
            username = None

            if not user:
                # Create new user
                # We leave hashed_password null for OAuth users
                cur.execute(
                    "INSERT INTO users (email) VALUES (%s) RETURNING id",
                    (email,)
                )
                user_id = cur.fetchone()[0]
                conn.commit()
                is_new = True
            else:
                user_id = user[0]
                username = user[1]

        conn.close()

        # Create JWT
        access_token = create_access_token(data={"sub": str(user_id), "email": email})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "username": username,
            "is_new": is_new
        }

    except ValueError:
        # Invalid token
        raise HTTPException(status_code=400, detail="Invalid Google Token")
    except Exception as e:
        logging.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@app.patch("/user/username")
def update_username(user_update: UserUpdate, user_id: int = Depends(get_current_user_id)):
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET username = %s WHERE id = %s",
                (user_update.username, user_id)
            )
            conn.commit()
        return {"status": "updated", "username": user_update.username}
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Username already exists")
    finally:
        conn.close()

# --- Interview Endpoints (Modified) ---

@app.post("/add")
def add_question(entry: InterviewEntry, user_id: int = Depends(get_current_user_id)):
    conn = get_db_conn()
    metadata = {
        "answer": entry.answer,
        "category": entry.category,
        "info_b": entry.info_b
    }
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO vault (user_id, question, metadata) VALUES (%s, %s, %s) RETURNING id",
                (user_id, entry.question, Json(metadata))
            )
            new_id = cur.fetchone()[0]
            conn.commit()
        return {"status": "created", "id": new_id}
    finally:
        conn.close()

@app.get("/search")
def search_vault(q: str, user_id: int = Depends(get_current_user_id)):
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            # The 'user_id = %s' is the most important part for privacy
            sql = """
                SELECT id, question, metadata
                FROM vault
                WHERE user_id = %s
                AND (
                    question ILIKE %s
                    OR metadata->>'answer' ILIKE %s
                )
            """
            # We pass user_id as the first parameter to the query
            cur.execute(sql, (user_id, f'%{q}%', f'%{q}%'))

            # Fetch and format
            rows = cur.fetchall()
            results = []
            for row in rows:
                results.append({
                    "id": row[0],
                    "question": row[1],
                    "metadata": row[2]
                })
            return results
    finally:
        conn.close()

# @app.post("/register") - DEPRECATED / REMOVED in favor of Google OAuth
