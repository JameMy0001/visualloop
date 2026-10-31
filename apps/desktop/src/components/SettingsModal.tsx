import React, { useState, useEffect } from "react";
import { X, Eye, EyeOff, Check, Key, Server, Cpu, Trash2 } from "lucide-react";
import { AIProvider, ProviderConfig, ProviderInfo } from "@visualloop/protocol";
import { coreClient } from "../services/coreClient";
import { tauriBridge } from "../services/tauriBridge";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (info: ProviderInfo) => void;
}

interface ProviderPreset {
  id: AIProvider;
  name: string;
  defaultModel: string;
  recommendedModels: string[];
  keyPlaceholder: string;
  envKeyName: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-pro",
    recommendedModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-1.5-pro"],
    keyPlaceholder: "AIzaSy...",
    envKeyName: "GEMINI_API_KEY",
  },
  {
    id: "openai",
    name: "OpenAI / ChatGPT",
    defaultModel: "gpt-4o",
    recommendedModels: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    keyPlaceholder: "sk-proj-...",
    envKeyName: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    defaultModel: "claude-3-7-sonnet-20250219",
    recommendedModels: [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
    keyPlaceholder: "sk-ant-...",
    envKeyName: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai-compatible",
    name: "Custom / Compatible",
    defaultModel: "local-model",
    recommendedModels: ["local-model", "llama3.3", "qwen2.5-coder", "deepseek-r1"],
    keyPlaceholder: "sk-...",
    envKeyName: "OPENAI_COMPATIBLE_API_KEY",
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>("gemini");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [modelInput, setModelInput] = useState<string>("gemini-2.5-pro");
  const [baseUrlInput, setBaseUrlInput] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  const [activeInfo, setActiveInfo] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "info" | "success" | "error";
    text: string;
  } | null>(null);

  // Load existing configuration on modal open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setStatusMessage(null);

    const loadConfig = async () => {
      try {
        // Try Core Server first, fallback to native TauriBridge
        let info: ProviderInfo | null = null;
        try {
          info = await coreClient.getProviderConfig();
        } catch {
          info = await tauriBridge.getProviderConfig();
        }

        if (isMounted && info) {
          setActiveInfo(info);
          setSelectedProvider(info.provider);
          setModelInput(info.model || "gemini-2.5-pro");
          setBaseUrlInput(info.baseUrl || "");
          setApiKeyInput(""); // Keep input clean; masked key shown in badge
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn("Failed to load provider config:", err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // When changing provider tab, update model default if empty or unchanged
  const handleSelectProvider = (provider: AIProvider) => {
    setSelectedProvider(provider);
    const preset = PROVIDER_PRESETS.find((p) => p.id === provider);
    if (preset) {
      // If switching away, set recommended default model
      if (!activeInfo || activeInfo.provider !== provider) {
        setModelInput(preset.defaultModel);
      } else {
        setModelInput(activeInfo.model || preset.defaultModel);
      }
    }
    setApiKeyInput("");
    setStatusMessage(null);
  };

  const handleConfirmSave = async () => {
    setLoading(true);
    setStatusMessage({ type: "info", text: "Saving and activating provider configuration..." });

    const payload: Partial<ProviderConfig> = {
      provider: selectedProvider,
      model: modelInput.trim() || undefined,
      baseUrl: selectedProvider === "openai-compatible" ? baseUrlInput.trim() : undefined,
    };

    if (apiKeyInput.trim().length > 0) {
      payload.apiKey = apiKeyInput.trim();
    }

    try {
      // 1. Save via Core Server API
      let updated: ProviderInfo | null = null;
      try {
        updated = await coreClient.saveProviderConfig(payload);
      } catch (err) {
        // Fallback to Native Tauri / LocalStorage if Core Server offline
        updated = await tauriBridge.saveProviderConfig(payload);
      }

      if (updated) {
        setActiveInfo(updated);
        setStatusMessage({
          type: "success",
          text: `[OK] Active provider: ${updated.provider} (${updated.model})`,
        });
        if (onSaved) onSaved(updated);
        setApiKeyInput("");
      } else {
        setStatusMessage({
          type: "success",
          text: `[OK] Provider config updated for ${selectedProvider}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `[FAIL] ${err.message || "Could not save provider settings"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearKey = async () => {
    setLoading(true);
    try {
      const payload: Partial<ProviderConfig> = {
        provider: selectedProvider,
        apiKey: "__CLEAR__",
      };
      let updated: ProviderInfo | null = null;
      try {
        updated = await coreClient.saveProviderConfig(payload);
      } catch {
        updated = await tauriBridge.saveProviderConfig(payload);
      }
      if (updated) {
        setActiveInfo(updated);
      }
      setApiKeyInput("");
      setStatusMessage({
        type: "info",
        text: `[OK] Cleared credentials for ${selectedProvider}`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `[FAIL] Failed to clear key: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentPreset =
    PROVIDER_PRESETS.find((p) => p.id === selectedProvider) || PROVIDER_PRESETS[0];
  const isCurrentProviderActive = activeInfo?.provider === selectedProvider;
  const hasSavedKeyForCurrent = isCurrentProviderActive && activeInfo?.hasApiKey;

  return (
    <div
      data-no-drag
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-[460px] bg-[#FFFFFF] border border-[#E5E5E5] rounded-[14px] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (40px) */}
        <div className="h-[40px] px-3.5 flex items-center justify-between border-b border-[#E5E5E5] bg-[#FFFFFF]">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-[3px] bg-[#000000] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 1024 1024" className="w-2.5 h-2.5" fill="none">
                <polygon points="164,260 272.3,260 374,504 475.7,260 584,260 374,764" fill="#FFFFFF" />
                <polygon points="638,260 738,260 738,664 860,664 860,764 638,764" fill="#FFFFFF" />
              </svg>
            </div>
            <span className="text-xs font-semibold text-[#171717] tracking-tight">
              AI Provider Settings
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close Settings (Esc)"
            className="p-1 rounded-[6px] text-[#737373] hover:text-[#171717] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 flex flex-col gap-4 text-[#171717] bg-[#FFFFFF] overflow-y-auto max-h-[80vh]">
          {/* Section: Choose AI Provider */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider">
              Choose AI Provider
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F5F5F5] border border-[#E5E5E5] rounded-[10px]">
              {PROVIDER_PRESETS.map((preset) => {
                const isSelected = selectedProvider === preset.id;
                const isConfigured = activeInfo?.provider === preset.id && activeInfo?.hasApiKey;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectProvider(preset.id)}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-[8px] text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#FFFFFF] text-[#171717] shadow-xs border border-[#E0E0E0]"
                        : "text-[#525252] hover:text-[#171717] hover:bg-[#EBEBEB]"
                    }`}
                  >
                    <span className="truncate">{preset.name}</span>
                    {isConfigured && (
                      <span className="ml-1 text-[10px] font-mono text-[#171717] bg-[#EBEBEB] px-1 py-0.5 rounded">
                        [OK]
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: API Key */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-1">
                <Key className="w-3 h-3 text-[#737373]" />
                <span>API Key</span>
              </label>
              {hasSavedKeyForCurrent && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#525252]">
                    {activeInfo?.maskedApiKey}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearKey}
                    title="Remove stored key"
                    className="p-1 rounded text-[#737373] hover:text-[#C2413B] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="relative flex items-center">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  hasSavedKeyForCurrent
                    ? "Enter new key to replace existing..."
                    : currentPreset.keyPlaceholder
                }
                className="w-full h-[34px] pl-3 pr-9 bg-[#FAFAFA] border border-[#D4D4D4] rounded-[8px] text-xs text-[#171717] placeholder-[#A3A3A3] focus:outline-none focus:border-[#171717] focus:bg-[#FFFFFF] transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "Hide key" : "Show key"}
                className="absolute right-2 p-1 text-[#737373] hover:text-[#171717] transition-colors cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-[#737373] leading-normal">
              Stored locally in <code className="font-mono text-[#525252]">~/.visualloop/provider_config.json</code> with 0600 mode.
            </p>
          </div>

          {/* Section: Model Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[#737373]" />
              <span>Model Name</span>
            </label>
            <input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder={currentPreset.defaultModel}
              className="w-full h-[34px] px-3 bg-[#FAFAFA] border border-[#D4D4D4] rounded-[8px] text-xs text-[#171717] placeholder-[#A3A3A3] focus:outline-none focus:border-[#171717] focus:bg-[#FFFFFF] transition-colors font-mono"
            />
            {/* Quick model presets */}
            <div className="flex flex-wrap gap-1 mt-0.5">
              {currentPreset.recommendedModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModelInput(m)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-[5px] border transition-colors cursor-pointer ${
                    modelInput === m
                      ? "bg-[#171717] text-[#FFFFFF] border-[#171717]"
                      : "bg-[#FAFAFA] text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3] hover:text-[#171717]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Base URL (Only for custom/openai-compatible) */}
          {selectedProvider === "openai-compatible" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-[#525252] uppercase tracking-wider flex items-center gap-1">
                <Server className="w-3 h-3 text-[#737373]" />
                <span>Base URL</span>
              </label>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="w-full h-[34px] px-3 bg-[#FAFAFA] border border-[#D4D4D4] rounded-[8px] text-xs text-[#171717] placeholder-[#A3A3A3] focus:outline-none focus:border-[#171717] focus:bg-[#FFFFFF] transition-colors font-mono"
              />
              <p className="text-[10px] text-[#737373]">
                Compatible with Ollama, vLLM, LM Studio, Groq, or OpenAI proxies.
              </p>
            </div>
          )}

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-2 rounded-[8px] text-[11px] font-mono border ${
                statusMessage.type === "success"
                  ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
                  : statusMessage.type === "error"
                  ? "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
                  : "bg-[#F5F5F5] border-[#E5E5E5] text-[#525252]"
              }`}
            >
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Modal Footer (44px) */}
        <div className="h-[44px] px-4 flex items-center justify-between border-t border-[#E5E5E5] bg-[#FAFAFA]">
          <span className="text-[10px] text-[#737373] font-mono">
            Provider: {selectedProvider}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded-[6px] text-xs font-medium text-[#525252] hover:text-[#171717] hover:bg-[#EBEBEB] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium text-[#FFFFFF] bg-[#171717] hover:bg-[#303030] active:scale-98 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm & Activate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
