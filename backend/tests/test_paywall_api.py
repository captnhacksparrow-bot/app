"""Backend tests for Captn Hack paywall app."""
import os
import re
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://verified-users-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
LOG_PATH = "/var/log/supervisor/backend.err.log"


def _read_otp_for(email: str, retries: int = 5, sleep: float = 0.6) -> str | None:
    pat = re.compile(rf"\[OTP-DEV\] code for {re.escape(email.lower())} = (\d{{6}})")
    for _ in range(retries):
        try:
            with open(LOG_PATH, "r", errors="ignore") as f:
                lines = f.readlines()
            # iterate from bottom to find latest
            for line in reversed(lines):
                m = pat.search(line)
                if m:
                    return m.group(1)
        except FileNotFoundError:
            pass
        time.sleep(sleep)
    return None


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_email():
    return f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def state():
    return {}


# ---- Public endpoints ------------------------------------------------------
class TestPublic:
    def test_config(self, session):
        r = session.get(f"{API}/config", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "stripe_payment_link" in d and d["stripe_payment_link"].startswith("https://buy.stripe.com")
        assert "subscription_price" in d and d["subscription_price"]

    def test_root(self, session):
        r = session.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---- Auth ------------------------------------------------------------------
class TestAuth:
    def test_register_creates_user(self, session, test_email, state):
        r = session.post(f"{API}/auth/register", json={"email": test_email, "password": "Test123!"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "access_token" in d
        assert d["user"]["email"] == test_email.lower()
        assert d["user"]["email_verified"] is False
        assert d["user"]["subscription_active"] is False
        state["token"] = d["access_token"]
        state["user_id"] = d["user"]["id"]

    def test_register_duplicate_409(self, session, test_email):
        r = session.post(f"{API}/auth/register", json={"email": test_email, "password": "Test123!"}, timeout=15)
        assert r.status_code == 409, r.text

    def test_login_success(self, session, test_email, state):
        r = session.post(f"{API}/auth/login", json={"email": test_email, "password": "Test123!"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == test_email.lower()

    def test_login_wrong_password(self, session, test_email):
        r = session.post(f"{API}/auth/login", json={"email": test_email, "password": "wrongpass"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, session, state):
        h = {"Authorization": f"Bearer {state['token']}"}
        r = session.get(f"{API}/auth/me", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == state["user_id"]

    def test_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---- OTP -------------------------------------------------------------------
class TestOTP:
    def test_otp_wrong_code(self, session, state):
        h = {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}
        r = session.post(f"{API}/auth/otp/verify", json={"code": "000000"}, headers=h, timeout=15)
        # 000000 is unlikely to match — if it does, treat as flake
        assert r.status_code == 400, r.text
        assert "Invalid" in r.json().get("detail", "")

    def test_otp_resend_rotates_code(self, session, state, test_email):
        old = _read_otp_for(test_email)
        h = {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}
        r = session.post(f"{API}/auth/otp/resend", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "sent"
        time.sleep(0.5)
        new = _read_otp_for(test_email)
        assert new is not None
        # old verification with prior code should fail (since rotated)
        if old and old != new:
            r2 = session.post(f"{API}/auth/otp/verify", json={"code": old}, headers=h, timeout=15)
            assert r2.status_code == 400
        state["otp"] = new

    def test_otp_verify_success(self, session, state, test_email):
        code = state.get("otp") or _read_otp_for(test_email)
        assert code, "OTP not found in backend logs"
        h = {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}
        r = session.post(f"{API}/auth/otp/verify", json={"code": code}, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["email_verified"] is True

        # GET /me to confirm persistence
        r2 = session.get(f"{API}/auth/me", headers=h, timeout=15)
        assert r2.status_code == 200 and r2.json()["email_verified"] is True


# ---- Subscription / Gated --------------------------------------------------
class TestGate:
    def test_subscription_check_no_active(self, session, state):
        h = {"Authorization": f"Bearer {state['token']}", "Content-Type": "application/json"}
        r = session.post(f"{API}/subscription/check", headers=h, timeout=30)
        assert r.status_code == 200, r.text  # ensure stripe key works (no 502)
        assert r.json() == {"subscription_active": False}

    def test_gated_url_402_when_no_subscription(self, session, state):
        h = {"Authorization": f"Bearer {state['token']}"}
        r = session.get(f"{API}/gated/url", headers=h, timeout=15)
        assert r.status_code == 402, r.text

    def test_gated_url_403_when_email_not_verified(self, session):
        # register a new fresh user without verifying
        em = f"TEST_unv_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={"email": em, "password": "Test123!"}, timeout=15)
        assert r.status_code == 200
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r2 = session.get(f"{API}/gated/url", headers=h, timeout=15)
        assert r2.status_code == 403


# ---- cleanup ---------------------------------------------------------------
@pytest.fixture(scope="module", autouse=True)
def cleanup_after(state):
    yield
    # Best-effort: data persists; tests prefixed TEST_ for visibility.
    pass
