import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { Settings as SettingsIcon, RefreshCw } from "lucide-react-native";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

export default function GatedView() {
  const router = useRouter();
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
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
  }, [user, router]);

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
        <Text style={styles.headerTitle}>Captn Hack</Text>
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
  headerActions: { flexDirection: "row", gap: 6 },
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
    padding: 28,
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
