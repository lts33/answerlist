from fastapi import FastAPI, HTTPException, Depends, status, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from passlib.context import CryptContext
import os
import requests
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import JWTError, jwt
from datetime import datetime, timedelta

app = FastAPI()

# Security: Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Config
SECRET_KEY = os.getenv("SECRET_KEY", "default_secret_key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 30
# Frontend should fetch this or have it hardcoded, but backend needs it for verification
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PYDANTIC MODELS ---

class UserCreate(BaseModel):
    username: str
    password: str

class InterviewEntry(BaseModel):
    question: str
    answer: str
    # user_id is removed from input as it comes from token
    category: Optional[str] = "General"
    info_b: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleLogin(BaseModel):
    token: str

class UserUpdate(BaseModel):
    username: str

# --- DATABASE CONNECTION ---

def get_db_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)

# --- AUTH UTILS ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        scheme, token = authorization.split()
        if scheme.lower() != 'bearer':
             raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication scheme")

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
        return user_id
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

# --- USER ENDPOINTS ---

@app.post("/login/google")
def login_google(login_data: GoogleLogin):
    try:
        # Verify the token with Google
        id_info = id_token.verify_oauth2_token(login_data.token, google_requests.Request(), GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Google token")

    email = id_info.get('email')
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in token")

    conn = get_db_conn()

    # Check if user exists
    with conn.cursor() as cur:
        # Note: Database must have 'email' column added to 'users' table.
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()

        if not user:
            # Create new user
            # Default username to email prefix
            username = email.split('@')[0]

            # Handle potential username collision by appending random numbers if needed
            # For simplicity, we try once, if fail, we append.
            try:
                cur.execute(
                    "INSERT INTO users (username, email) VALUES (%s, %s) RETURNING id",
                    (username, email)
                )
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                import random
                username = f"{username}_{random.randint(1000,9999)}"
                cur.execute(
                    "INSERT INTO users (username, email) VALUES (%s, %s) RETURNING id",
                    (username, email)
                )

            new_user = cur.fetchone()
            conn.commit()
            user_id = new_user['id']
            is_new = True
        else:
            user_id = user['id']
            username = user['username']
            is_new = False

    access_token = create_access_token(data={"sub": user_id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": username,
        "is_new": is_new
    }

@app.put("/user/username")
def update_username(user_update: UserUpdate, user_id: int = Depends(get_current_user)):
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET username = %s WHERE id = %s", (user_update.username, user_id))
            if cur.rowcount == 0:
                 conn.rollback()
                 raise HTTPException(status_code=404, detail="User not found")
            conn.commit()
        return {"status": "Username updated", "username": user_update.username}
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Username already exists")

@app.post("/register")
def register_user(user: UserCreate):
    conn = get_db_conn()
    hashed_password = pwd_context.hash(user.password)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (username, hashed_password) VALUES (%s, %s) RETURNING id",
                (user.username, hashed_password)
            )
            new_user = cur.fetchone()
            conn.commit()
            return {"status": "User created", "user_id": new_user['id']}
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Username already exists")

# --- INTERVIEW ENDPOINTS ---

@app.post("/add")
def add_question(entry: InterviewEntry, user_id: int = Depends(get_current_user)):
    conn = get_db_conn()
    metadata = {
        "answer": entry.answer,
        "category": entry.category,
        "info_b": entry.info_b
    }
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO vault (user_id, question, metadata) VALUES (%s, %s, %s) RETURNING id",
            (user_id, entry.question, Json(metadata))
        )
        new_id = cur.fetchone()['id']
        conn.commit()
    return {"status": "created", "id": new_id}

@app.get("/search")
def search_vault(q: str, user_id: int = Depends(get_current_user)):
    conn = get_db_conn()
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
        cur.execute(sql, (user_id, f'%{q}%', f'%{q}%'))
        return cur.fetchall()

@app.get("/auth/config")
def auth_config():
    return {"google_client_id": GOOGLE_CLIENT_ID}
