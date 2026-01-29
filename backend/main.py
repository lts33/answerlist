from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi import status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from google.oauth2 import id_token
from google.auth.transport import requests
from jose import jwt, JWTError
import os
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

# --- CONFIGURATION ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
SECRET_KEY = os.getenv("SECRET_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
ALGORITHM = "HS256"

app = FastAPI(docs_url="/", redoc_url=None)

# --- MIDDLEWARE ---
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class GoogleToken(BaseModel):
    token: str
    name: Optional[str] = None

class VaultItem(BaseModel):
    question: str
    answer: str
    tag_ids: Optional[List[int]] = []

class TagCreate(BaseModel):
    name: str
    type: str

class TagResponse(TagCreate):
    id: int

# --- DATABASE & SECURITY ---
def get_db_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/google")

def get_current_user_id(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

# --- ENDPOINTS ---


@app.post("/auth/google")
def auth_google(data: GoogleToken):
    conn = None
    try:
        # 1. Verify Google Token
        idinfo = id_token.verify_oauth2_token(data.token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']

        conn = get_db_conn()
        with conn.cursor() as cur:
            # 2. Check if user already exists
            cur.execute("SELECT id, full_name FROM users WHERE email = %s", (email,))
            user = cur.fetchone()

            if user:
                # --- SCENARIO A: RETURNING USER ---
                # "Get the name stored before"
                user_id = user['id']
                stored_name = user['full_name']

                # Generate Token
                payload = {"user_id": user_id, "email": email, "name": stored_name}
                token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

                return {
                    "status": "login_success",
                    "access_token": token,
                    "token_type": "bearer",
                    "username": stored_name
                }

            else:
                # --- SCENARIO B: NEW USER ---

                # Check if the frontend sent a name in this request
                if not data.name:
                    # If no name provided yet, stop and ask Frontend to get it
                    return JSONResponse(
                        status_code=status.HTTP_202_ACCEPTED,
                        content={
                            "status": "register_required",
                            "detail": "User not found. Please provide a display name."
                        }
                    )

                # If name IS provided, create the user
                cur.execute(
                    "INSERT INTO users (email, full_name) VALUES (%s, %s) RETURNING id",
                    (email, data.name)
                )
                user_id = cur.fetchone()['id']
                conn.commit()

                # Generate Token for the new user
                payload = {"user_id": user_id, "email": email, "name": data.name}
                token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

                return {
                    "status": "register_success",
                    "access_token": token,
                    "token_type": "bearer",
                    "username": data.name
                }

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Google Token")
    except Exception as e:
        if conn: conn.rollback()
        print(f"Auth Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    finally:
        if conn: conn.close()

@app.post("/tags", response_model=TagResponse)
def create_tag(tag: TagCreate, user_id: int = Depends(get_current_user_id)):
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            # Check if tag exists
            cur.execute("SELECT id FROM tags WHERE name = %s", (tag.name,))
            existing = cur.fetchone()
            if existing:
                raise HTTPException(status_code=400, detail="Tag already exists")

            cur.execute(
                "INSERT INTO tags (name, type) VALUES (%s, %s) RETURNING id",
                (tag.name, tag.type)
            )
            new_id = cur.fetchone()['id']
            conn.commit()
            return {"id": new_id, "name": tag.name, "type": tag.type}
    except HTTPException as he:
        raise he
    except Exception as e:
        if conn: conn.rollback()
        print(f"Create Tag Error: {e}")
        raise HTTPException(status_code=500, detail="Database Error")
    finally:
        if conn: conn.close()

@app.get("/tags", response_model=List[TagResponse])
def get_tags(user_id: int = Depends(get_current_user_id)):
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, type FROM tags")
            return cur.fetchall()
    except Exception as e:
        print(f"Get Tags Error: {e}")
        raise HTTPException(status_code=500, detail="Database Error")
    finally:
        if conn: conn.close()

@app.post("/add")
def add_to_vault(item: VaultItem, user_id: int = Depends(get_current_user_id)):
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            meta_data = Json({"answer": item.answer})
            cur.execute(
                "INSERT INTO vault (user_id, question, metadata) VALUES (%s, %s, %s) RETURNING id",
                (user_id, item.question, meta_data)
            )
            question_id = cur.fetchone()['id']

            if item.tag_ids:
                # Insert tags
                # Use executemany or build a value string. For simplicity/safety with psycopg2:
                tag_values = [(question_id, tag_id) for tag_id in item.tag_ids]
                args_str = ','.join(cur.mogrify("(%s,%s)", x).decode('utf-8') for x in tag_values)
                cur.execute("INSERT INTO question_tags (question_id, tag_id) VALUES " + args_str)

            conn.commit()
        return {"status": "success", "id": question_id}
    except Exception as e:
        if conn: conn.rollback()
        print(f"Add Error: {e}")
        raise HTTPException(status_code=500, detail="Database Error")
    finally:
        if conn: conn.close()

@app.get("/all")
def get_all(limit: int = 10, offset: int = 0, user_id: int = Depends(get_current_user_id)):
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            # SHARED KNOWLEDGE BASE:
            # We intentionally removed 'WHERE v.user_id = %s' to allow all users to see all questions.
            sql = """
                SELECT v.id, v.question, v.metadata,
                       COALESCE(
                           json_agg(
                               json_build_object('id', t.id, 'name', t.name, 'type', t.type)
                           ) FILTER (WHERE t.id IS NOT NULL),
                           '[]'
                       ) as tags
                FROM vault v
                LEFT JOIN question_tags qt ON v.id = qt.question_id
                LEFT JOIN tags t ON qt.tag_id = t.id
                GROUP BY v.id
                LIMIT %s OFFSET %s
            """
            cur.execute(sql, (limit, offset))
            return cur.fetchall()
    except Exception as e:
        print(f"Get All Error: {e}")
        raise HTTPException(status_code=500, detail="Database Error")
    finally:
        if conn: conn.close()

@app.get("/search")
def search_vault(q: str, user_id: int = Depends(get_current_user_id)):
    conn = None
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            # SHARED KNOWLEDGE BASE:
            # We intentionally removed 'WHERE v.user_id = %s' to allow all users to search all questions.
            # Note: Postgres ILIKE is case-insensitive
            sql = """
                SELECT v.id, v.question, v.metadata,
                       COALESCE(
                           json_agg(
                               json_build_object('id', t.id, 'name', t.name, 'type', t.type)
                           ) FILTER (WHERE t.id IS NOT NULL),
                           '[]'
                       ) as tags
                FROM vault v
                LEFT JOIN question_tags qt ON v.id = qt.question_id
                LEFT JOIN tags t ON qt.tag_id = t.id
                WHERE (v.question ILIKE %s OR v.metadata->>'answer' ILIKE %s)
                GROUP BY v.id
            """
            search_term = f'%{q}%'
            cur.execute(sql, (search_term, search_term))
            return cur.fetchall()
    except Exception as e:
        print(f"Search Error: {e}")
        raise HTTPException(status_code=500, detail="Database Error")
    finally:
        if conn: conn.close()
