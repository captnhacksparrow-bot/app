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
import requests
from requests.auth import HTTPBasicAuth
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
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
GATED_URL = os.environ.get('GATED_URL', '')
MAILJET_API_KEY = os.environ.get('MAILJET_API_KEY', '')
MAILJET_SECRET_KEY = os.environ.get('MAILJET_SECRET_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@captnhack.com')
SENDER_NAME = os.environ.get('SENDER_NAME', 'Captn Hack')
SUBSCRIPTION_PRICE_LABEL = os.environ.get('SUBSCRIPTION_PRICE_LABEL', '$9.99/mo')

stripe.api_key = STRIPE_API_KEY

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


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    email_verified: bool
    subscription_active: bool
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse


class PortalRequest(BaseModel):
    return_url: Optional[str] = None


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
    """Send OTP via Mailjet if configured, otherwise log to console."""
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
    text = f"Your Captn Hack verification code is: {code}\n\nThis code expires in 10 minutes."

    if MAILJET_API_KEY and MAILJET_SECRET_KEY:
        try:
            payload = {
                "Messages": [
                    {
                        "From": {"Email": SENDER_EMAIL, "Name": SENDER_NAME},
                        "To": [{"Email": email}],
                        "Subject": subject,
                        "TextPart": text,
                        "HTMLPart": html,
                    }
                ]
            }

            def _send():
                return requests.post(
                    "https://api.mailjet.com/v3.1/send",
                    json=payload,
                    auth=HTTPBasicAuth(MAILJET_API_KEY, MAILJET_SECRET_KEY),
                    timeout=15,
                )

            resp = await asyncio.to_thread(_send)
            if resp.status_code in (200, 201):
                logger.info(f"OTP emailed to {email} via Mailjet (status {resp.status_code})")
                return
            logger.error(f"Mailjet send failed for {email}: HTTP {resp.status_code} - {resp.text}")
        except Exception as e:
            logger.error(f"Mailjet exception for {email}: {e}")

    # Fallback: log to console (dev / testing / mailjet failure)
    logger.info(f"[OTP-DEV] code for {email} = {code}")


async def check_stripe_subscription(email: str) -> bool:
    """Return True if email has an active or trialing subscription on the Stripe account."""
    if not STRIPE_API_KEY:
        return False
    try:
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


async def _activate_subscription_for_email(email: Optional[str], active: bool) -> None:
    if not email:
        return
    email = email.lower().strip()
    res = await db.users.update_one(
        {"email": email},
        {"$set": {
            "subscription_active": active,
            "subscription_last_checked_at": datetime.now(timezone.utc),
        }},
    )
    logger.info(
        f"Webhook updated subscription_active={active} for {email} "
        f"(matched={res.matched_count}, modified={res.modified_count})"
    )


async def _email_for_customer(customer_id: Optional[str]) -> Optional[str]:
    if not customer_id:
        return None
    try:
        cust = await asyncio.to_thread(lambda: stripe.Customer.retrieve(customer_id))
        return getattr(cust, "email", None)
    except Exception as e:
        logger.error(f"Could not retrieve customer {customer_id}: {e}")
        return None


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
    if not user.get("email_verified"):
        raise HTTPException(status_code=403, detail="Email not verified")
    if not user.get("subscription_active"):
        raise HTTPException(status_code=402, detail="Subscription required")
    return {"url": GATED_URL}


# ---- BILLING PORTAL --------------------------------------------------------
@api.post("/billing/portal")
async def billing_portal(req: PortalRequest, user: dict = Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")
    try:
        customers = await asyncio.to_thread(
            lambda: stripe.Customer.list(email=user["email"], limit=1)
        )
        if not customers.data:
            raise HTTPException(
                status_code=404,
                detail="No Stripe customer found for this email. Subscribe first.",
            )
        customer_id = customers.data[0].id
        return_url = req.return_url or "https://captnhacksparrow.edgeone.app/"
        session = await asyncio.to_thread(
            lambda: stripe.billing_portal.Session.create(
                customer=customer_id, return_url=return_url
            )
        )
        return {"url": session.url}
    except stripe.error.InvalidRequestError as e:
        msg = str(e)
        if "configuration" in msg.lower() or "no configuration" in msg.lower():
            raise HTTPException(
                status_code=409,
                detail=(
                    "Stripe Customer Portal is not configured. "
                    "Enable it in your Stripe Dashboard at "
                    "https://dashboard.stripe.com/settings/billing/portal"
                ),
            )
        raise HTTPException(status_code=502, detail=f"Stripe error: {msg}")
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {str(e)}")


# ---- STRIPE WEBHOOK --------------------------------------------------------
@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    """Receive Stripe webhook events and update subscription_active on users."""
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Webhook received but STRIPE_WEBHOOK_SECRET not set — ignoring")
        return {"status": "ignored", "reason": "webhook secret not configured"}

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {str(e)}")

    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {}) or {}

    event_id = event.get("id")
    if event_id:
        already = await db.stripe_events.find_one({"event_id": event_id})
        if already:
            return {"status": "duplicate"}
        await db.stripe_events.insert_one({
            "event_id": event_id,
            "type": event_type,
            "received_at": datetime.now(timezone.utc),
        })

    try:
        if event_type in ("customer.subscription.created", "customer.subscription.updated"):
            status_str = obj.get("status")
            email = await _email_for_customer(obj.get("customer"))
            active = status_str in ("active", "trialing", "past_due")
            await _activate_subscription_for_email(email, active)

        elif event_type == "customer.subscription.deleted":
            email = await _email_for_customer(obj.get("customer"))
            await _activate_subscription_for_email(email, False)

        elif event_type == "invoice.paid":
            email = obj.get("customer_email") or await _email_for_customer(obj.get("customer"))
            await _activate_subscription_for_email(email, True)

        elif event_type == "checkout.session.completed":
            payment_status = obj.get("payment_status")
            email = (
                obj.get("customer_email")
                or (obj.get("customer_details") or {}).get("email")
                or await _email_for_customer(obj.get("customer"))
            )
            if payment_status == "paid":
                await _activate_subscription_for_email(email, True)

        else:
            logger.info(f"Webhook event {event_type} ignored")

    except Exception as e:
        logger.exception(f"Error handling webhook {event_type}: {e}")
        raise HTTPException(status_code=500, detail="Webhook handler error")

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.otp_codes.create_index("email")
    await db.stripe_events.create_index("event_id", unique=True)
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
