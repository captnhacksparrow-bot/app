import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useRootNavigationState } from "expo-router";
import { WebView } from "react-native-webview";
import { Settings as SettingsIcon, RefreshCw } from "lucide-react-native";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

const LOGO = "https://customer-assets.emergentagent.com/job_verified-users-1/artifacts/lz4eqr36_AI_Generated_Logo_2026-03-14_2b734a39-d5dc-4b54-9b2d-146561d4e1e2.png";

export default function GatedView() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const { user, loading } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!rootNavState?.key) return;
    if (loading) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (!user.email_verified) {
      router.replace("/otp");
      return;
    }
    if (!user.subscription_active) {
      router.replace("/paywall");
      return;
    }
    api
      .gatedUrl()
      .then((res) => setUrl(res.url))
      .catch((e) => setError(e?.message || "Could not load."));
  }, [user, loading, rootNavState?.key, router]);

  // Prevent UI flashing while auth/router are not ready
  if (!rootNavState?.key || loading || !user || !user.email_verified || !user.subscription_active) {
    if (error) {
      // fall through to error UI
    } else {
      return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="webview-loading">
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        </SafeAreaView>
      );
    }
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.errBox}>
          <Text style={styles.errTitle}>Access denied</Text>
          <Text style={styles.errMsg}>{error}</Text>
          <TouchableOpacity
            testID="webview-back-paywall"
            style={styles.errBtn}
            onPress={() => router.replace("/paywall")}
          >
            <Text style={styles.errBtnText}>Back to paywall</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]} testID="webview-screen">
      <View style={styles.header}>
        <Image source={{ uri: LOGO }} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.headerActions}>
          <Pressable
            testID="webview-reload"
            onPress={() => setReloadKey((k) => k + 1)}
            style={styles.iconBtn}
          >
            <RefreshCw color={colors.textPrimary} size={18} />
          </Pressable>
          <Pressable
            testID="webview-settings"
            onPress={() => router.push("/settings")}
            style={styles.iconBtn}
          >
            <SettingsIcon color={colors.textPrimary} size={20} />
          </Pressable>
        </View>
      </View>

      {url ? (
        Platform.OS === "web" ? (
          // react-native-webview not supported on web; use iframe-style View instructions
          <View style={styles.webFallback}>
            <Text style={styles.webFallbackTitle}>Premium content unlocked</Text>
            <Text style={styles.webFallbackMsg}>
              Open the gated site in your browser:
            </Text>
            <TouchableOpacity
              testID="webview-open-external"
              style={styles.openBtn}
              onPress={() => {
                if (typeof window !== "undefined") window.open(url, "_blank");
              }}
            >
              <Text style={styles.openBtnText}>Open Captn Hack Streams</Text>
            </TouchableOpacity>
            <Text style={styles.urlHint}>{url}</Text>
          </View>
        ) : (
          <WebView
            key={reloadKey}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: colors.background }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            )}
          />
        )
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerLogo: { width: 110, height: 36 },
  fallbackLogo: { width: 200, height: 200, marginBottom: 8 },headerActions: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  errBox: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 12 },
  errTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "600" },
  errMsg: { color: colors.textSecondary, textAlign: "center" },
  errBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    minHeight: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  errBtnText: { color: "#0A0A0A", fontWeight: "700" },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackBgLogo: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.18,
  },
  fallbackContent: {
    width: "100%",
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  webFallbackTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: "300", letterSpacing: -0.5 },
  webFallbackMsg: { color: colors.textSecondary, textAlign: "center" },
  openBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    minHeight: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  openBtnText: { color: "#0A0A0A", fontWeight: "700", fontSize: 16 },
  urlHint: { color: colors.textMuted, fontSize: 12, marginTop: 18 },
});
