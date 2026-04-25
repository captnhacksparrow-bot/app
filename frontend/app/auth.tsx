import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

export default function Auth() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode = params.mode === "login" ? "login" : "signup";
  const [mode, setMode] = useState<"signup" | "login">(initialMode as any);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { signIn, signUp } = useAuth();

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const u = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      if (!u.email_verified) router.replace("/otp");
      else if (!u.subscription_active) router.replace("/paywall");
      else router.replace("/webview");
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            testID="auth-back-button"
            onPress={() => router.back()}
            style={styles.back}
          >
            <ArrowLeft color={colors.textPrimary} size={22} />
          </TouchableOpacity>

          <Text style={styles.eyebrow}>{mode === "signup" ? "JOIN THE CREW" : "WELCOME BACK"}</Text>
          <Text style={styles.title}>
            {mode === "signup" ? "Access your\nchest" : "Continue your\nvoyage"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "signup"
              ? "Create an account to unlock the vault."
              : "Sign in with your email and password."}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              testID="auth-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="captn@hack.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              testID="auth-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              style={styles.input}
            />
          </View>

          {error ? (
            <Text style={styles.error} testID="auth-error">
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            testID="auth-submit-button"
            style={[styles.cta, busy && { opacity: 0.7 }]}
            disabled={busy}
            onPress={submit}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.ctaText}>{mode === "signup" ? "Create account" : "Sign in"}</Text>
            )}
          </TouchableOpacity>

          <Pressable
            testID="auth-toggle-mode-button"
            onPress={() => {
              setError(null);
              setMode(mode === "signup" ? "login" : "signup");
            }}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>
              {mode === "signup"
                ? "Already have an account? "
                : "New here? "}
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                {mode === "signup" ? "Sign in" : "Create one"}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 24, paddingBottom: 60 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 4,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: 12,
  },
  title: {
    fontSize: 38,
    color: colors.textPrimary,
    fontWeight: "300",
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 12,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 32,
    lineHeight: 22,
  },
  field: { marginBottom: 18 },
  label: {
    fontSize: 11,
    letterSpacing: 2.5,
    color: colors.textSecondary,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 18,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 16,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: 12,
    marginTop: 2,
  },
  cta: {
    marginTop: 12,
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaText: {
    color: "#0A0A0A",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  toggle: { paddingVertical: 24, alignItems: "center" },
  toggleText: { color: colors.textSecondary, fontSize: 14 },
});
