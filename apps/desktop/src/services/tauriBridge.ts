import { WindowMode } from "@visualloop/protocol";

export interface PlatformInfo {
  os: string;
  arch: string;
  supports_click_through: boolean;
  always_on_top_supported: boolean;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

class TauriBridge {
  private isTauriEnv: boolean;

  constructor() {
    this.isTauriEnv =
      typeof window !== "undefined" &&
      Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  }

  public isAvailable(): boolean {
    return this.isTauriEnv;
  }

  public async getPlatformInfo(): Promise<PlatformInfo> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<PlatformInfo>("get_platform_info");
      } catch (err) {
        console.warn("Failed to invoke get_platform_info, fallback to browser", err);
      }
    }
    return {
      os: "macos",
      arch: "arm64",
      supports_click_through: true,
      always_on_top_supported: true,
    };
  }

  public async getAuthToken(): Promise<string | undefined> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const token = await invoke<string | null>("get_auth_token");
        if (token && token.trim().length > 0) {
          return token.trim();
        }
      } catch (err) {
        console.warn("Failed to invoke get_auth_token from Tauri", err);
      }
    }

    // Web / browser environment fallbacks
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const queryToken = urlParams.get("token");
        if (queryToken && queryToken.trim().length > 0) {
          return queryToken.trim();
        }

        const stored = localStorage.getItem("visualloop_auth_token");
        if (stored && stored.trim().length > 0) {
          return stored.trim();
        }

        const viteToken = (import.meta as any).env?.VITE_VISUALLOOP_TOKEN;
        if (viteToken && typeof viteToken === "string" && viteToken.trim().length > 0) {
          return viteToken.trim();
        }

        const winToken = (window as any).__VISUALLOOP_TOKEN__;
        if (winToken && typeof winToken === "string" && winToken.trim().length > 0) {
          return winToken.trim();
        }
      } catch {
        // ignore browser storage exceptions
      }
    }
    return undefined;
  }

  public async setWindowMode(mode: WindowMode): Promise<void> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_window_mode", { mode });
        return;
      } catch (err) {
        console.warn("Tauri invoke set_window_mode failed", err);
      }
    }
    // Browser fallback simulation
    console.info(`[Simulation Mode] Window mode set to: ${mode}`);
  }

  public async setClickThrough(enabled: boolean): Promise<void> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_click_through", { enabled });
        return;
      } catch (err) {
        console.warn("Tauri invoke set_click_through failed", err);
      }
    }
    console.info(`[Simulation Mode] Click-through set to: ${enabled}`);
  }

  public async setAlwaysOnTop(enabled: boolean): Promise<void> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_always_on_top", { enabled });
        return;
      } catch (err) {
        console.warn("Tauri invoke set_always_on_top failed", err);
      }
    }
    console.info(`[Simulation Mode] Always-on-top set to: ${enabled}`);
  }

  public async getWindowBounds(): Promise<WindowBounds> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<WindowBounds>("get_window_bounds");
      } catch (err) {
        console.warn("Tauri invoke get_window_bounds failed", err);
      }
    }
    return {
      x: 100,
      y: 100,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  public async setWindowPosition(x: number, y: number): Promise<void> {
    if (this.isTauriEnv) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_window_position", { x, y });
        return;
      } catch (err) {
        console.warn("Tauri invoke set_window_position failed", err);
      }
    }
  }

  public async startDragging(): Promise<void> {
    if (this.isTauriEnv) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
        return;
      } catch (err) {
        console.warn("Tauri getCurrentWindow().startDragging() failed, trying command fallback", err);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("start_dragging");
          return;
        } catch (inner) {
          console.warn("Tauri invoke start_dragging failed", inner);
        }
      }
    }
  }

  public async closeWindow(): Promise<void> {
    if (this.isTauriEnv) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
        return;
      } catch (err) {
        console.warn("Tauri getCurrentWindow().close() failed, trying command fallback", err);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("close_window");
          return;
        } catch (inner) {
          console.warn("Tauri invoke close_window failed", inner);
        }
      }
    }
    window.close();
  }

  public async registerGlobalShortcut(
    shortcut: string,
    handler: () => void
  ): Promise<() => void> {
    if (this.isTauriEnv) {
      try {
        const { register, unregister } = await import(
          "@tauri-apps/plugin-global-shortcut"
        );
        await register(shortcut, () => {
          handler();
        });
        return () => {
          unregister(shortcut).catch(console.error);
        };
      } catch (err) {
        console.warn("Failed to register Tauri global shortcut", err);
      }
    }

    // Web DOM fallback listener for testing in browser
    const keyListener = (e: KeyboardEvent) => {
      // Check for Cmd+Shift+V or Ctrl+Shift+V
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "V" || e.key === "v")) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", keyListener);
    return () => {
      window.removeEventListener("keydown", keyListener);
    };
  }
}

export const tauriBridge = new TauriBridge();
