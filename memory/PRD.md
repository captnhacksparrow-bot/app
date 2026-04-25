# Captn Hack Paywall — PRD

## Goal
Paywall the site `https://captnhacksparrow.edgeone.app/` behind Stripe subscription, with a verified-user database (email + OTP verification + active subscription gate).

## Stack
- Frontend: Expo (React Native) with expo-router
- Backend: FastAPI + MongoDB
- Auth: JWT (Bearer, stored in expo-secure-store)
- Email: Resend (optional — falls back to logging OTP to backend logs)
- Payments: Existing Stripe Payment Link (`buy.stripe.com/00w8wPa8v5EggE5aAj6AM00`); subscription verified by Stripe API using user-provided **restricted live key**.

## User flow
1. Welcome screen → "Enter the Vault"
2. Auth (email + password — sign up or sign in)
3. Email OTP verification (6-digit, 10 min expiry)
4. Paywall — opens Stripe Payment Link in browser (with `prefilled_email`)
5. After payment, "I've paid — verify & unlock" — backend looks up Stripe customer by email and confirms an `active` / `trialing` / `past_due` subscription
6. Gated WebView loads the captnhacksparrow site
7. Settings — view email, recheck subscription, log out

## Backend collections
- `users`: { id, email (unique), password_hash, email_verified, subscription_active, stripe_customer_id, created_at }
- `otp_codes`: { email, code, expires_at, used }

## Key endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/auth/otp/resend`, `POST /api/auth/otp/verify`
- `POST /api/subscription/check`, `GET /api/gated/url`
- `GET /api/config` (returns Stripe Payment Link + price label to the client)

## Notes
- Stripe key in env is a `rk_live` restricted key — user-provided.
- If Resend API key is empty, OTP is logged to backend stdout for dev/testing.
- Gated URL is only returned after both `email_verified=true` AND `subscription_active=true`.
