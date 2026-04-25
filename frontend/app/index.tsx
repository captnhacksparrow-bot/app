import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useRootNavigationState } from "expo-router";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

const BG = "https://images.unsplash.com/photo-1760224254117-7a40f7f03fe2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBsdXh1cnklMjB0ZXh0dXJlJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3NzcxMDExNDF8MA&ixlib=rb-4.1.0&q=85";
const LOGO = "https://customer-assets.emergentagent.com/job_verified-users-1/artifacts/lz4eqr36_AI_Generated_Logo_2026-03-14_2b734a39-d5dc-4b54-9b2d-146561d4e1e2.png";

export default function Welcome() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const { user, loading } = useAuth();
  const { width: winW } = useWindowDimensions();
  const [logoErr, setLogoErr] = useState(false);
  const logoSize = Math.min(320, Math.round(winW * 0.7));

  useEffect(() => {
    if (!rootNavState?.key) return;
    if (loading) return;
    if (!user) return;
    if (!user.email_verified) router.replace("/otp");
    else if (!user.subscription_active) router.replace("/paywall");
    else router.replace("/webview");
  }, [user, loading, rootNavState?.key, router]);

  if (loading) {
    return (
      <View style={styles.loader} testID="welcome-loading">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ImageBackground source={{ uri: BG }} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.topSpacer}>
          {logoErr ? (
            <Text style={styles.logoFallback} testID="welcome-logo-fallback">
              CAPT&apos;N{"\n"}HACK{"\n"}STREAMS
            </Text>
          ) : (
            <Image
              source={{ uri: LOGO }}
              style={{ width: logoSize, height: logoSize }}
              resizeMode="contain"
              onError={() => setLogoErr(true)}
              testID="welcome-logo"
            />
          )}
        </View>

        <View style={styles.bottomSheet} testID="welcome-screen">
          <Text style={styles.eyebrow}>PREMIUM ACCESS</Text>
          <Text style={styles.title}>Welcome aboard,{"\n"}matey</Text>
          <Text style={styles.subtitle}>
            Unlimited TV & movies. Members-only vault. Zero logs.
          </Text>

          <TouchableOpacity
            testID="welcome-enter-vault-button"
            activeOpacity={0.85}
            style={styles.cta}
            onPress={() => router.push("/auth")}
          >
            <Text style={styles.ctaText}>Enter the Vault</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="welcome-signin-link"
            onPress={() => router.push({ pathname: "/auth", params: { mode: "login" } })}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.background },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(3,3,5,0.55)" },
  loader: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, justifyContent: "flex-end" },
  topSpacer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  logo: { width: "85%", aspectRatio: 1, maxWidth: 360, maxHeight: 360 },
  logoFallback: {
    fontSize: 44,
    fontWeight: "800",
    color: colors.primary,
    textAlign: "center",
    letterSpacing: 2,
    lineHeight: 52,
  },
  bottomSheet: {
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 36,
    backgroundColor: "rgba(3,3,5,0.72)",
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 4,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: 14,
  },
  title: {
    fontSize: 44,
    color: colors.textPrimary,
    fontWeight: "300",
    letterSpacing: -1.2,
    lineHeight: 48,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 30,
  },
  cta: {
    backgroundColor: colors.primary,
    minHeight: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaText: {
    color: "#0A0A0A",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  secondary: { paddingVertical: 16, alignItems: "center" },
  secondaryText: { color: colors.textSecondary, fontSize: 14 },
});
