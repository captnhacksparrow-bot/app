import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useRootNavigationState } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowLeft, Mail, ShieldCheck, LogOut, RefreshCw, CreditCard } from "lucide-react-native";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

export default function Settings() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const { user, loading, signOut, refresh } = useAuth();
  const [recheck, setRecheck] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!rootNavState?.key) return;
    if (!loading && !user) router.replace("/auth");
  }, [loading, user, rootNavState?.key, router]);

  const openPortal = async () => {
    setPortalBusy(true);
    setMsg(null);
    try {
      const res = await api.billingPortal();
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.open(res.url, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(res.url);
      }
    } catch (e: any) {
      setMsg(e?.message || "Could not open billing portal.");
    } finally {
      setPortalBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="settings-loading">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const recheckSub = async () => {
    setRecheck(true);
    setMsg(null);
    try {
      const res = await api.checkSubscription();
      await refresh();
      setMsg(res.subscription_active ? "Subscription active." : "No active subscription on this email.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to check.");
    } finally {
      setRecheck(false);
    }
  };

  const logout = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]} testID="settings-screen">
      <View style={styles.header}>
        <TouchableOpacity
          testID="settings-back"
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft color={colors.textPrimary} size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.iconBubble}>
            <Mail color={colors.primary} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Account</Text>
            <Text style={styles.rowValue} testID="settings-email">{user?.email}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.iconBubble}>
            <ShieldCheck color={colors.primary} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Subscription</Text>
            <Text
              testID="settings-subscription-status"
              style={[styles.rowValue, { color: user?.subscription_active ? colors.success : colors.error }]}
            >
              {user?.subscription_active ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>

        <Pressable
          testID="settings-recheck-button"
          onPress={recheckSub}
          style={styles.action}
        >
          {recheck ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <RefreshCw color={colors.textPrimary} size={16} />
              <Text style={styles.actionText}>Re-check subscription</Text>
            </>
          )}
        </Pressable>

        <Pressable
          testID="settings-manage-subscription-button"
          onPress={openPortal}
          style={[styles.action, { marginTop: 12 }]}
          disabled={portalBusy}
        >
          {portalBusy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <CreditCard color={colors.textPrimary} size={16} />
              <Text style={styles.actionText}>Manage subscription</Text>
            </>
          )}
        </Pressable>

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <View style={{ flex: 1 }} />

        <Pressable testID="settings-logout-button" onPress={logout} style={styles.logout}>
          <LogOut color={colors.error} size={18} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
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
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, padding: 20 },
  row: {
    height: 72,
    borderBottomWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(217,119,6,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  rowValue: { color: colors.textPrimary, fontSize: 16, marginTop: 4 },
  action: {
    marginTop: 22,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actionText: { color: colors.textPrimary, fontWeight: "600", fontSize: 15 },
  msg: { color: colors.textSecondary, marginTop: 12, fontSize: 14 },
  logout: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: 16 },
});
