import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "captnhack_auth_token";

// expo-secure-store doesn't work on web; fall back to localStorage there
export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
      } catch {
        return null;
      }
    }
    return await SecureStore.getItemAsync(KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(KEY, token);
      } catch {}
      return;
    }
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear(): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(KEY);
  },
};
