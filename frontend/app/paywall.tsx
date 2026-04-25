import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  ImageBackground,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Check, Sparkles, Lock } from "lucide-react-native";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

const BG = "https://images.pexels.com/photos/30263578/pexels-photo-30263578.jpeg";

const FEATURES = [
  "Unlimited streaming",
  "Ad-free experience",
  "Premium 4K support",
  "Cancel anytime",
];

export default function Paywall() {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("$9.99/mo");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (!user) router.replace("/auth");
    else if (!user.email_verified) router.replace("/otp");
    else if (user.subscription_active) router.replace("/webview");
  }, [user, router]);

  useEffect(() => {
    api.config().then((c) => {
      setPaymentLink(c.stripe_payment_link);
      if (c.subscription_price) setPrice(c.subscription_price);
    }).catch(() => {});
  }, []);

  const openCheckout = async () => {
    if (!paymentLink) return;
    setError(null);
    const url = `${paymentLink}${paymentLink.includes("?") ? "&" : "?"}prefilled_email=${encodeURIComponent(
      user?.email ?? ""
    )}`;
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.open(url, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e: any) {
      setError(e?.message || "Could not open checkout.");
    } finally {
      // Always reveal the verify button so user can confirm payment after returning.
      setHasOpened(true);
    }
  };

  const verifyPaid = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await api.checkSubscription();
      await refresh();
      if (res.subscription_active) {
        router.replace("/webview");
      } else {
        setError(
          "We couldn't find an active subscription on this email yet. If you just paid, wait a few seconds and try again."
        );
      }
    } catch (e: any) {
      setError(e?.message || "Could not verify subscription.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <ImageBackground source={{ uri: BG }} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="paywall-screen">
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.badge}>
            <Sparkles color={colors.primary} size={14} />
            <Text style={styles.badgeText}>MONTHLY PLUNDER</Text>
          </View>

          <Text style={styles.title}>Unlock the{"\n"}Vault</Text>
          <Text style={styles.subtitle}>
            Subscribe to access the members-only stream library, hand-curated by Captn Hack himself.
          </Text>

          <View style={styles.card} testID="paywall-pricing-card">
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Membership</Text>
              <Text style={styles.priceValue}>{price}</Text>
            </View>
            <View style={styles.divider} />
            {FEATURES.map((f) => (
              <View style={styles.feature} key={f}>
                <View style={styles.checkBubble}>
                  <Check color={colors.primary} size={14} />
                </View>
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          {error ? (
            <Text style={styles.error} testID="paywall-error">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.stickyCta}>
          {!hasOpened ? (
            <TouchableOpacity
              testID="paywall-subscribe-button"
              style={styles.cta}
              activeOpacity={0.85}
              onPress={openCheckout}
              disabled={!paymentLink}
            >
              <Lock color="#0A0A0A" size={18} />
              <Text style={styles.ctaText}>Subscribe with Stripe</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="paywall-verify-button"
              style={styles.cta}
              activeOpacity={0.85}
              onPress={verifyPaid}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : (
                <Text style={styles.ctaText}>I&apos;ve paid — verify & unlock</Text>
              )}
            </TouchableOpacity>
          )}

          {hasOpened ? (
            <Pressable
              testID="paywall-reopen-checkout"
              onPress={openCheckout}
              style={styles.reopen}
            >
              <Text style={styles.reopenText}>Re-open Stripe checkout</Text>
            </Pressable>
          ) : null}

          <Pressable
            testID="paywall-signout-button"
            onPress={async () => {
              await signOut();
              router.replace("/");
            }}
            style={styles.signout}
          >
            <Text style={styles.signoutText}>Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.background },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(3,3,5,0.78)" },
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 32 },
  badge: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(217,119,6,0.12)",
    borderColor: "rgba(217,119,6,0.4)",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 12,
    marginBottom: 20,
  },
  badgeText: { color: colors.primary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  title: {
    fontSize: 44,
    color: colors.textPrimary,
    fontWeight: "300",
    letterSpacing: -1.2,
    lineHeight: 48,
    marginBottom: 14,
  },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  card: {
    borderRadius: 28,
    backgroundColor: "rgba(15,16,22,0.85)",
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.35)",
    padding: 22,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    marginBottom: 18,
  },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  priceLabel: { color: colors.textSecondary, fontSize: 13, letterSpacing: 1.5, fontWeight: "700" },
  priceValue: { color: colors.textPrimary, fontSize: 32, fontWeight: "300", letterSpacing: -0.5 },
  divider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: 18 },
  feature: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(217,119,6,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  featureText: { color: colors.textPrimary, fontSize: 15 },
  error: { color: colors.error, marginTop: 8, fontSize: 14 },
  stickyCta: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(3,3,5,0.92)",
  },
  cta: {
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaText: { color: "#0A0A0A", fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  reopen: { paddingVertical: 12, alignItems: "center" },
  reopenText: { color: colors.textSecondary, fontSize: 14 },
  signout: { paddingVertical: 8, alignItems: "center" },
  signoutText: { color: colors.textMuted, fontSize: 13 },
});
