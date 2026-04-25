from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import secrets
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
import stripe
import resend
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')
STRIPE_PAYMENT_LINK = os.environ.get('STRIPE_PAYMENT_LINK', '')
GATED_URL = os.environ.get('GATED_URL', '')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
SUBSCRIPTION_PRICE_LABEL = os.environ.get('SUBSCRIPTION_PRICE_LABEL', '$9.99/mo')

stripe.api_key = STRIPE_API_KEY
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

app = FastAPI()
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OTPVerifyRequest(BaseModel):
    code: str


class ResendOTPRequest(BaseModel):
    pass


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    email_verified: bool
    subscription_active: bool
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def user_to_response(user: dict) -> UserResponse:
    return UserResponse(
        id=user["id"],
        email=user["email"],
        email_verified=user.get("email_verified", False),
        subscription_active=user.get("subscription_active", False),
        created_at=user.get("created_at", datetime.now(timezone.utc)),
    )


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def send_otp_email(email: str, code: str) -> None:
    """Send OTP via Resend if configured, otherwise log to console."""
    subject = "Your Captn Hack verification code"
    html = f"""
    <div style="font-family:Arial,sans-serif;background:#030305;color:#F8FAFC;padding:32px">
      <h2 style="color:#D97706;margin:0 0 16px">Captn Hack — Verify your email</h2>
      <p>Use the code below to confirm your email and unlock the vault.</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;background:#0F1016;
                  padding:20px;border-radius:12px;text-align:center;margin:24px 0;color:#F59E0B">
        {code}
      </div>
      <p style="color:#94A3B8;font-size:13px">This code expires in 10 minutes.</p>
    </div>
    """
    if RESEND_API_KEY:
        try:
            params = {"from": SENDER_EMAIL, "to": [email], "subject": subject, "html": html}
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"OTP emailed to {email}")
            return
        except Exception as e:
            logger.error(f"Resend send failed for {email}: {e}")
    # Fallback: log to console (dev / testing)
    logger.info(f"[OTP-DEV] code for {email} = {code}")


async def check_stripe_subscription(email: str) -> bool:
    """Return True if email has an active or trialing subscription on the Stripe account."""
    if not STRIPE_API_KEY:
        return False
    try:
        # Search customers by email
        customers = await asyncio.to_thread(
            lambda: stripe.Customer.list(email=email, limit=10)
        )
        for cust in customers.auto_paging_iter() if hasattr(customers, "auto_paging_iter") else customers.data:
            subs = await asyncio.to_thread(
                lambda c=cust: stripe.Subscription.list(customer=c.id, status="all", limit=20)
            )
            for sub in subs.data:
                if sub.status in ("active", "trialing", "past_due"):
                    return True
        return False
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error checking subscription for {email}: {e}")
        raise HTTPException(status_code=502, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error checking Stripe subscription for {email}: {e}")
        return False


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {
        "service": "captnhack-paywall",
        "status": "ok",
        "stripe_payment_link": STRIPE_PAYMENT_LINK,
        "subscription_price": SUBSCRIPTION_PRICE_LABEL,
    }


@api.get("/config")
async def public_config():
    return {
        "stripe_payment_link": STRIPE_PAYMENT_LINK,
        "subscription_price": SUBSCRIPTION_PRICE_LABEL,
    }


# ---- AUTH ------------------------------------------------------------------
@api.post("/auth/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(req.password),
        "email_verified": False,
        "subscription_active": False,
        "stripe_customer_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)

    # Issue an OTP
    code = generate_otp()
    await db.otp_codes.delete_many({"email": email})
    await db.otp_codes.insert_one({
        "email": email,
        "code": code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "used": False,
    })
    await send_otp_email(email, code)

    token = create_access_token(user_id, email)
    return AuthResponse(access_token=token, user=user_to_response(user_doc))


@api.post("/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return AuthResponse(access_token=token, user=user_to_response(user))


@api.get("/auth/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)):
    return user_to_response(user)


# ---- EMAIL OTP -------------------------------------------------------------
@api.post("/auth/otp/resend")
async def otp_resend(user: dict = Depends(get_current_user)):
    if user.get("email_verified"):
        return {"status": "already_verified"}
    code = generate_otp()
    await db.otp_codes.delete_many({"email": user["email"]})
    await db.otp_codes.insert_one({
        "email": user["email"],
        "code": code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "used": False,
    })
    await send_otp_email(user["email"], code)
    return {"status": "sent"}


@api.post("/auth/otp/verify", response_model=UserResponse)
async def otp_verify(req: OTPVerifyRequest, user: dict = Depends(get_current_user)):
    code = req.code.strip()
    rec = await db.otp_codes.find_one({"email": user["email"], "code": code, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid code")
    if rec["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")
    await db.otp_codes.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_verified": True}})
    user["email_verified"] = True
    return user_to_response(user)


# ---- SUBSCRIPTION GATE -----------------------------------------------------
@api.post("/subscription/check")
async def subscription_check(user: dict = Depends(get_current_user)):
    """Verify with Stripe if the user's email has an active subscription."""
    if not user.get("email_verified"):
        raise HTTPException(status_code=403, detail="Email not verified")
    is_active = await check_stripe_subscription(user["email"])
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "subscription_active": is_active,
            "subscription_last_checked_at": datetime.now(timezone.utc),
        }},
    )
    return {"subscription_active": is_active}


@api.get("/gated/url")
async def gated_url(user: dict = Depends(get_current_user)):
    """Return the gated URL only if user is verified + subscribed."""
    if not user.get("email_verified"):
        raise HTTPException(status_code=403, detail="Email not verified")
    if not user.get("subscription_active"):
        raise HTTPException(status_code=402, detail="Subscription required")
    return {"url": GATED_URL}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.otp_codes.create_index("email")
    logger.info("Indexes ensured. Service ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
