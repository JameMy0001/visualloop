import { useState, useEffect, useCallback } from "react";
import { WindowMode, WindowState } from "@visualloop/protocol";
import { tauriBridge } from "../services/tauriBridge";

const STORAGE_KEY_CONFIG = "visualloop_window_config";

interface StoredConfig {
  opacity: number;
  clickThrough: boolean;
  position?: { x: number; y: number };
}

export function useWindowState() {
  const [mode, setModeState] = useState<WindowMode>("mini");
  const [state, setState] = useState<WindowState>("mini_idle");
  const [opacity, setOpacityState] = useState<number>(0.8);
  const [clickThrough, setClickThroughState] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ready");

  // Load saved preferences on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed: StoredConfig = JSON.parse(raw);
        if (typeof parsed.opacity === "number") setOpacityState(parsed.opacity);
        if (typeof parsed.clickThrough === "boolean") setClickThroughState(parsed.clickThrough);
      }
    } catch (e) {
      console.warn("Failed to read stored config", e);
    }
  }, []);

  // Save preferences
  const saveConfig = useCallback((updates: Partial<StoredConfig>) => {
    try {
      const current = localStorage.getItem(STORAGE_KEY_CONFIG);
      const parsed: StoredConfig = current ? JSON.parse(current) : { opacity: 0.8, clickThrough: false };
      const next = { ...parsed, ...updates };
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(next));
    } catch (e) {
      console.warn("Failed to save config", e);
    }
  }, []);

  // Set window mode with native Tauri sync
  const setMode = useCallback(
    async (newMode: WindowMode) => {
      setModeState(newMode);
      if (newMode === "expanded") {
        setState("expanded");
        // Expansion forces full opacity and disables click-through
        await tauriBridge.setClickThrough(false);
        await tauriBridge.setWindowMode("expanded");
      } else if (newMode === "mini") {
        setState("mini_idle");
        // Restore mini click-through and opacity
        await tauriBridge.setClickThrough(clickThrough);
        await tauriBridge.setWindowMode("mini");
      } else {
        setState("hidden");
        await tauriBridge.setWindowMode("hidden");
      }
    },
    [clickThrough]
  );

  const toggleExpand = useCallback(() => {
    if (mode === "mini") {
      setMode("expanded");
    } else {
      setMode("mini");
    }
  }, [mode, setMode]);

  const setClickThrough = useCallback(
    async (enabled: boolean) => {
      setClickThroughState(enabled);
      saveConfig({ clickThrough: enabled });
      if (mode === "mini") {
        await tauriBridge.setClickThrough(enabled);
      }
    },
    [mode, saveConfig]
  );

  const toggleClickThrough = useCallback(() => {
    setClickThrough(!clickThrough);
  }, [clickThrough, setClickThrough]);

  const setOpacity = useCallback(
    (val: number) => {
      const clamped = Math.max(0.2, Math.min(1.0, val));
      setOpacityState(clamped);
      saveConfig({ opacity: clamped });
    },
    [saveConfig]
  );

  // Register global hotkey Command+Shift+V or Ctrl+Shift+V
  useEffect(() => {
    let unregister: (() => void) | undefined;
    tauriBridge
      .registerGlobalShortcut("CommandOrControl+Shift+V", () => {
        toggleExpand();
      })
      .then((cleanup: (() => void) | undefined) => {
        unregister = cleanup;
      });

    return () => {
      if (unregister) unregister();
    };
  }, [toggleExpand]);

  return {
    mode,
    state,
    opacity: mode === "expanded" ? 1.0 : opacity,
    clickThrough: mode === "expanded" ? false : clickThrough,
    statusMessage,
    setMode,
    setState,
    setStatusMessage,
    toggleExpand,
    setClickThrough,
    toggleClickThrough,
    setOpacity,
  };
}
