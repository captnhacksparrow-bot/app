import { tokenStorage } from "./storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export type ApiUser = {
  id: string;
  email: string;
  email_verified: boolean;
  subscription_active: boolean;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  user: ApiUser;
};

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth) {
    const token = await tokenStorage.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const detail = data?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
        ? detail.map((d) => d?.msg || JSON.stringify(d)).join(", ")
        : `Request failed (${res.status})`;
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  config: () => request<{ stripe_payment_link: string; subscription_price: string }>("/config"),
  register: (email: string, password: string) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: { email, password } }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request<ApiUser>("/auth/me", { auth: true }),
  resendOtp: () => request<{ status: string }>("/auth/otp/resend", { method: "POST", auth: true }),
  verifyOtp: (code: string) =>
    request<ApiUser>("/auth/otp/verify", { method: "POST", body: { code }, auth: true }),
  checkSubscription: () =>
    request<{ subscription_active: boolean }>("/subscription/check", { method: "POST", auth: true }),
  gatedUrl: () => request<{ url: string }>("/gated/url", { auth: true }),
};
