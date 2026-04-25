import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import { colors } from "../src/theme";

const LEN = 6;

export default function OTP() {
  const router = useRouter();
  const { user, refresh, signOut } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resentMsg, setResentMsg] = useState<string | null>(null);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (!user) router.replace("/auth");
    else if (user.email_verified) {
      if (!user.subscription_active) router.replace("/paywall");
      else router.replace("/webview");
    }
  }, [user, router]);

  const setDigit = (i: number, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    if (cleaned.length > 1) {
      // paste
      const arr = cleaned.slice(0, LEN).split("");
      const next = [...digits];
      for (let k = 0; k < LEN; k++) next[k] = arr[k] ?? "";
      setDigits(next);
      const focus = Math.min(arr.length, LEN - 1);
      inputs.current[focus]?.focus();
      if (arr.length >= LEN) submit(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = cleaned;
    setDigits(next);
    if (cleaned && i < LEN - 1) inputs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) submit(next.join(""));
  };

  const onKeyPress = (i: number, key: string) => {
    if (key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const submit = async (code: string) => {
    setError(null);
    setBusy(true);
    try {
      await api.verifyOtp(code);
      const u = await refresh();
      if (u && !u.subscription_active) router.replace("/paywall");
      else router.replace("/webview");
    } catch (e: any) {
      setError(e?.message || "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setResentMsg(null);
    setError(null);
    try {
      await api.resendOtp();
      setResentMsg("New code sent.");
    } catch (e: any) {
      setError(e?.message || "Failed to resend.");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.eyebrow}>VERIFY EMAIL</Text>
          <Text style={styles.title}>Verify{"\n"}transmission</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code we sent to{" "}
            <Text style={{ color: colors.textPrimary }}>{user?.email ?? "your email"}</Text>.
          </Text>

          <View style={styles.row} testID="otp-inputs">
            {digits.map((d, i) => (
              <TextInput
                key={i}
                testID={`otp-input-${i}`}
                ref={(r) => {
                  inputs.current[i] = r;
                }}
                value={d}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={i === 0 ? LEN : 1}
                style={[styles.cell, d ? styles.cellFilled : null]}
                autoFocus={i === 0}
              />
            ))}
          </View>

          {error ? (
            <Text style={styles.error} testID="otp-error">
              {error}
            </Text>
          ) : null}
          {resentMsg ? <Text style={styles.success}>{resentMsg}</Text> : null}

          <TouchableOpacity
            testID="otp-resend-button"
            onPress={resend}
            disabled={resending}
            style={styles.resend}
          >
            {resending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.resendText}>
                Didn&apos;t receive it? <Text style={{ color: colors.primary, fontWeight: "700" }}>Resend code</Text>
              </Text>
            )}
          </TouchableOpacity>

          {busy ? (
            <View style={styles.busy} testID="otp-verifying">
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.busyText}>Verifying…</Text>
            </View>
          ) : null}

          <View style={{ flex: 1 }} />

          <Pressable
            testID="otp-signout-button"
            onPress={async () => {
              await signOut();
              router.replace("/");
            }}
            style={styles.signout}
          >
            <Text style={styles.signoutText}>Use a different email</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, padding: 24 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 4,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  title: {
    fontSize: 38,
    color: colors.textPrimary,
    fontWeight: "300",
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 12,
  },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginBottom: 32, lineHeight: 22 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  cell: {
    width: 48,
    height: 60,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
  },
  cellFilled: { borderColor: colors.primary },
  error: { color: colors.error, marginTop: 8, fontSize: 14 },
  success: { color: colors.success, marginTop: 8, fontSize: 14 },
  resend: { marginTop: 18, paddingVertical: 8 },
  resendText: { color: colors.textSecondary, fontSize: 14 },
  busy: { flexDirection: "row", alignItems: "center", marginTop: 18, gap: 10 },
  busyText: { color: colors.textSecondary, marginLeft: 8 },
  signout: { paddingVertical: 16, alignItems: "center" },
  signoutText: { color: colors.textMuted, fontSize: 13 },
});
