# Captn Hack Paywall — PRD

## Goal
Paywall the site `https://captnhacksparrow.edgeone.app/` behind Stripe subscription, with a verified-user database (email + OTP verification + active subscription gate).

## Stack
- Frontend: Expo (React Native) with expo-router
- Backend: FastAPI + MongoDB
- Auth: JWT (Bearer, stored in expo-secure-store)
- Email: **Mailjet** (transactional via REST `/v3.1/send` with API/Secret key pair, falls back to logging OTP to backend logs if Mailjet rejects)
- Payments: Existing Stripe Payment Link (`buy.stripe.com/00w8wPa8v5EggE5aAj6AM00`); subscription verified by Stripe API using user-provided **restricted live key**.
- Billing self-service: **Stripe Customer Portal** session via `/api/billing/portal`.

## User flow
1. Welcome screen → "Enter the Vault"
2. Auth (email + password)
3. Email OTP verification (6-digit, 10 min expiry, sent via Mailjet)
4. Paywall — opens Stripe Payment Link in browser (with `prefilled_email`)
5. Verify subscription — backend looks up Stripe customer by email
6. Gated WebView loads the captnhacksparrow site
7. Settings — view email, recheck subscription, **Manage subscription** (Stripe Portal), log out

## Backend collections
- `users`: { id, email (unique), password_hash, email_verified, subscription_active, stripe_customer_id, created_at }
- `otp_codes`: { email, code, expires_at, used }

## Key endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/auth/otp/resend`, `POST /api/auth/otp/verify`
- `POST /api/subscription/check`, `GET /api/gated/url`
- `POST /api/billing/portal` — returns Customer Portal session URL
- `GET /api/config`

## Operational notes (action required by owner)
- **Mailjet account is blocked** — at the time of integration, Mailjet returned HTTP 401 *"Your account has been temporarily blocked. Please contact our support team to get assistance."* Until that's resolved, OTPs fall back to backend logs (`[OTP-DEV] code for <email> = <code>`).
  - Resolve: contact Mailjet support to unblock the account, then verify the sender email (`SENDER_EMAIL` in `/app/backend/.env`, currently `noreply@captnhack.com`) is verified at https://app.mailjet.com/account/sender.
- **Stripe Customer Portal must be enabled** in the Stripe Dashboard → Settings → Billing → Customer portal → Activate. Without that, `/api/billing/portal` returns HTTP 409 with a helpful message.
- **Stripe webhook is intentionally not implemented** in this iteration — owner can add later by sharing a `whsec_...` signing secret.

## Smart business note
Subscription verification is keyed on **email**, not Stripe Customer ID, so the same paying user can sign in from any device after paying via the existing Payment Link.
