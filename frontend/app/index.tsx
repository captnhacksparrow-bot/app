import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

const BG = "https://images.unsplash.com/photo-1760224254117-7a40f7f03fe2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBsdXh1cnklMjB0ZXh0dXJlJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3NzcxMDExNDF8MA&ixlib=rb-4.1.0&q=85";

export default function Welcome() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!user.email_verified) router.replace("/otp");
    else if (!user.subscription_active) router.replace("/paywall");
    else router.replace("/webview");
  }, [user, loading, router]);

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
        <View style={styles.topSpacer} />

        <View style={styles.bottomSheet} testID="welcome-screen">
          <Text style={styles.eyebrow}>PREMIUM ACCESS</Text>
          <Text style={styles.title}>Captn Hack{"\n"}Streams</Text>
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
  topSpacer: { flex: 1 },
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
