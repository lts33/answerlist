from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext
import os
import time
from jose import JWTError, jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

app = FastAPI()

# Environment Variables
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
# Database connection parameters
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Setup ---
def get_db_connection():
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

def init_db():
    """Initialize database tables if they don't exist."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Create users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Create questions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                category TEXT DEFAULT 'General',
                info_b TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Check for user_id column in questions table (migration support)
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='questions' AND column_name='user_id';
        """)
        if not cur.fetchone():
            print("Migrating questions table: adding user_id column")
            cur.execute("ALTER TABLE questions ADD COLUMN user_id INTEGER REFERENCES users(id);")

        conn.commit()
        cur.close()
    except Exception as e:
        print(f"DB Init Error: {e}")
    finally:
        if conn:
            conn.close()

# Initialize DB on startup (or manually called)
# In a real app, we might use migration tools like Alembic.
# For this task, we'll try to init on module load or let the first request handle it if needed.
# But calling it here might fail if DB isn't ready. We'll wrap it.
try:
    init_db()
except:
    pass # Expecting env vars might not be set in this environment

# --- Auth Helpers ---

def create_access_token(data: dict, expires_delta: Optional[int] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = time.time() + expires_delta
    else:
        expire = time.time() + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if user is None:
        raise credentials_exception
    return user

# --- Models ---

class GoogleLoginRequest(BaseModel):
    token: str

class UsernameUpdate(BaseModel):
    username: str

# --- Endpoints ---

@app.post("/login/google")
def login_google(request: GoogleLoginRequest):
    token = request.token

    try:
        # Verify the token
        # Specify the CLIENT_ID of the app that accesses the backend:
        id_info = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)

        # ID token is valid. Get the user's Google Account ID from the decoded token.
        # userid = id_info['sub'] # Unique Google ID
        email = id_info['email']

    except ValueError:
        # Invalid token
        raise HTTPException(status_code=401, detail="Invalid Google Token")

    # Check if user exists
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()

    is_new_user = False
    if not user:
        # Create new user
        cur.execute("INSERT INTO users (email) VALUES (%s) RETURNING *", (email,))
        user = cur.fetchone()
        conn.commit()
        is_new_user = True

    cur.close()
    conn.close()

    # Create JWT
    access_token = create_access_token(data={"sub": user['email']})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user['username'],
        "is_new_user": is_new_user
    }

@app.put("/user/username")
def update_username(username_update: UsernameUpdate, current_user: dict = Depends(get_current_user)):
    new_username = username_update.username.strip()
    if not new_username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    conn = get_db_connection()
    cur = conn.cursor()

    # Check if username is taken (optional but good practice)
    cur.execute("SELECT id FROM users WHERE username = %s AND id != %s", (new_username, current_user['id']))
    if cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Username already taken")

    cur.execute("UPDATE users SET username = %s WHERE id = %s", (new_username, current_user['id']))
    conn.commit()
    cur.close()
    conn.close()

    return {"message": "Username updated", "username": new_username}

@app.post("/add")
def add_question(
    question: str,
    answer: str,
    category: str = "General",
    info_b: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO questions (user_id, question, answer, category, info_b)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (current_user['id'], question, answer, category, info_b)
    )
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    return {"id": new_id, "message": "Question added successfully"}

@app.get("/search")
def search_questions(q: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Only search questions belonging to the current user
    # Simple ILIKE search
    search_term = f"%{q}%"
    cur.execute(
        """
        SELECT id, question, answer, category, info_b
        FROM questions
        WHERE user_id = %s AND (question ILIKE %s OR answer ILIKE %s)
        """,
        (current_user['id'], search_term, search_term)
    )
    results = cur.fetchall()
    cur.close()
    conn.close()

    # Format to match the structure the frontend expects if possible,
    # but based on the code provided earlier, the frontend expects:
    # item structure: { id, question, metadata: { answer, category, info_b } }

    formatted_results = []
    for row in results:
        formatted_results.append({
            "id": row['id'],
            "question": row['question'],
            "metadata": {
                "answer": row['answer'],
                "category": row['category'],
                "info_b": row['info_b']
            }
        })

    return formatted_results

@app.get("/")
def read_root():
    return {"message": "Welcome to the Interview Database API"}
