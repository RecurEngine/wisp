import { App, ButtonComponent, Notice, Plugin, PluginSettingTab } from "obsidian";
import type { SettingDefinition, SettingDefinitionItem, SettingControl } from "obsidian";
import { getApiKeyInputError } from "../core/ApiKeyValidation";
import { redactSecrets } from "../core/DebugInfo";
import type { WispVoiceProvider } from "../voice/VoiceProviderRegistry";
import type { WebSearchProviderId } from "../websearch/WebSearchTypes";
import { I18n, type TranslationKey, type WispLanguage } from "../i18n/I18n";

import { patchPluginData } from "../storage/PluginData";
import { DEFAULT_MAX_STEPS } from "../core/LiteAgentRuntime";

const API_KEY_SECRET_ID = "wisp-api-key";
const VOICE_API_KEY_SECRET_ID = "wisp-voice-api-key";
const WEB_SEARCH_API_KEY_SECRET_ID = "wisp-web-search-api-key";

export interface WispSettings {
  readonly language: WispLanguage;
  readonly mobileLayout: WispLayout;
  readonly provider: WispProvider;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly systemPrompt: string;
  readonly maxSteps: number;
  readonly debugMode: boolean;
  readonly voiceEnabled: boolean;
  readonly webSearchEnabled: boolean;
  readonly webSearchProvider: WebSearchProviderId;
  readonly webSearchBaseUrl: string;
  readonly webSearchMaxResults: number;
  readonly webSearchApiKey: string;
  readonly voiceProvider: WispVoiceProvider;
  readonly voiceBaseUrl: string;
  readonly voiceModel: string;
  readonly voiceApiKey: string;
}

export type WispProvider = "claude" | "openai-compatible";
export type WispLayout = "side" | "fullscreen";

const VOICE_PROVIDER_DEFAULTS: Record<WispVoiceProvider, { readonly baseUrl: string; readonly model: string }> = {
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-transcribe" },
  deepgram: { baseUrl: "https://api.deepgram.com", model: "nova-3" },
  dashscope: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen3-asr-flash" }
};

const WEB_SEARCH_PROVIDER_DEFAULTS: Record<WebSearchProviderId, { readonly baseUrl: string }> = {
  tavily: { baseUrl: "https://api.tavily.com" },
  brave: { baseUrl: "https://api.search.brave.com" }
};

interface PersistedWispSettings {
  readonly language?: unknown;
  readonly mobileLayout?: unknown;
  readonly provider?: unknown;
  readonly baseUrl?: unknown;
  readonly model?: unknown;
  readonly systemPrompt?: unknown;
  readonly maxSteps?: unknown;
  readonly debugMode?: unknown;
  readonly voiceEnabled?: unknown;
  readonly webSearchEnabled?: unknown;
  readonly webSearchProvider?: unknown;
  readonly webSearchBaseUrl?: unknown;
  readonly webSearchMaxResults?: unknown;
  readonly voiceProvider?: unknown;
  readonly voiceBaseUrl?: unknown;
  readonly voiceModel?: unknown;
}

export const DEFAULT_WISP_SETTINGS: WispSettings = {
  language: "auto",
  mobileLayout: "side",
  provider: "claude",
  baseUrl: "https://api.anthropic.com",
  model: "claude-sonnet-4-20250514",
  apiKey: "",
  systemPrompt: "",
  maxSteps: DEFAULT_MAX_STEPS,
  debugMode: false,
  voiceEnabled: true,
  webSearchEnabled: false,
  webSearchProvider: "tavily",
  webSearchBaseUrl: WEB_SEARCH_PROVIDER_DEFAULTS.tavily.baseUrl,
  webSearchMaxResults: 5,
  webSearchApiKey: "",
  voiceProvider: "openai-compatible",
  voiceBaseUrl: VOICE_PROVIDER_DEFAULTS["openai-compatible"].baseUrl,
  voiceModel: VOICE_PROVIDER_DEFAULTS["openai-compatible"].model,
  voiceApiKey: ""
};

export interface WispSettingsTesters {
  readonly chat: (settings: WispSettings) => Promise<void>;
  readonly voice: (settings: WispSettings) => Promise<void>;
  readonly web: (settings: WispSettings) => Promise<void>;
}

export class WispSettingsStore {
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<WispSettings> {
    const persisted = (await this.plugin.loadData()) as PersistedWispSettings | null;
    const provider = readProvider(persisted?.provider, inferProviderFromBaseUrl(persisted?.baseUrl));
    return {
      language: readLanguage(persisted?.language, DEFAULT_WISP_SETTINGS.language),
      mobileLayout: readMobileLayout(persisted?.mobileLayout, DEFAULT_WISP_SETTINGS.mobileLayout),
      provider,
      baseUrl: readString(persisted?.baseUrl, provider === "claude" ? DEFAULT_WISP_SETTINGS.baseUrl : "https://api.openai.com/v1"),
      model: readString(persisted?.model, provider === "claude" ? DEFAULT_WISP_SETTINGS.model : "gpt-4o-mini"),
      apiKey: this.plugin.app.secretStorage.getSecret(API_KEY_SECRET_ID) ?? "",
      systemPrompt: readString(persisted?.systemPrompt, DEFAULT_WISP_SETTINGS.systemPrompt),
      maxSteps: readInteger(persisted?.maxSteps, DEFAULT_MAX_STEPS, 0, 100),
      debugMode: readBoolean(persisted?.debugMode, DEFAULT_WISP_SETTINGS.debugMode),
      voiceEnabled: readBoolean(persisted?.voiceEnabled, DEFAULT_WISP_SETTINGS.voiceEnabled),
      webSearchEnabled: readBoolean(persisted?.webSearchEnabled, DEFAULT_WISP_SETTINGS.webSearchEnabled),
      webSearchProvider: readWebSearchProvider(persisted?.webSearchProvider, DEFAULT_WISP_SETTINGS.webSearchProvider),
      webSearchBaseUrl: readString(persisted?.webSearchBaseUrl, DEFAULT_WISP_SETTINGS.webSearchBaseUrl),
      webSearchMaxResults: readInteger(persisted?.webSearchMaxResults, DEFAULT_WISP_SETTINGS.webSearchMaxResults, 1, 10),
      webSearchApiKey: this.plugin.app.secretStorage.getSecret(WEB_SEARCH_API_KEY_SECRET_ID) ?? "",
      voiceProvider: readVoiceProvider(persisted?.voiceProvider, DEFAULT_WISP_SETTINGS.voiceProvider),
      voiceBaseUrl: readString(persisted?.voiceBaseUrl, DEFAULT_WISP_SETTINGS.voiceBaseUrl),
      voiceModel: readString(persisted?.voiceModel, DEFAULT_WISP_SETTINGS.voiceModel),
      voiceApiKey: this.plugin.app.secretStorage.getSecret(VOICE_API_KEY_SECRET_ID) ?? ""
    };
  }

  async save(settings: WispSettings): Promise<void> {
    this.plugin.app.secretStorage.setSecret(API_KEY_SECRET_ID, settings.apiKey);
    this.plugin.app.secretStorage.setSecret(VOICE_API_KEY_SECRET_ID, settings.voiceApiKey);
    this.plugin.app.secretStorage.setSecret(WEB_SEARCH_API_KEY_SECRET_ID, settings.webSearchApiKey);
    await patchPluginData(this.plugin, {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      systemPrompt: settings.systemPrompt,
      maxSteps: settings.maxSteps,
      debugMode: settings.debugMode,
      language: settings.language,
      mobileLayout: settings.mobileLayout,
      voiceEnabled: settings.voiceEnabled,
      webSearchEnabled: settings.webSearchEnabled,
      webSearchProvider: settings.webSearchProvider,
      webSearchBaseUrl: settings.webSearchBaseUrl,
      webSearchMaxResults: settings.webSearchMaxResults,
      voiceProvider: settings.voiceProvider,
      voiceBaseUrl: settings.voiceBaseUrl,
      voiceModel: settings.voiceModel
    });
  }
}

export class WispSettingTab extends PluginSettingTab {
  private draft?: WispSettings;
  private statusEl?: HTMLElement;
  private saveButton?: ButtonComponent;
  private dirty = false;
  private readonly i18n: I18n;

  constructor(
    app: App,
    plugin: Plugin,
    private readonly getSettings: () => WispSettings,
    private readonly saveSettings: (settings: WispSettings) => Promise<void>,
    private readonly testers: WispSettingsTesters
  ) {
    super(app, plugin);
    this.i18n = new I18n();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.draft ??= { ...this.getSettings() };
    this.i18n.setLanguage(this.draft.language);
    const control = (name: TranslationKey, desc: TranslationKey, binding: SettingControl): SettingDefinition => ({
      name: this.t(name), desc: this.t(desc), control: binding
    });
    const text = (key: keyof WispSettings, name: TranslationKey, desc: TranslationKey): SettingDefinition =>
      control(name, desc, { type: "text", key });
    const secret = (key: "apiKey" | "voiceApiKey" | "webSearchApiKey", name: TranslationKey, desc: TranslationKey): SettingDefinition => ({
      name: this.t(name), desc: this.t(desc), aliases: [key],
      render: (setting) => {
        setting.addText((input) => {
          input.inputEl.type = "password";
          input.inputEl.autocomplete = "off";
          input.setValue(this.draft?.[key] ?? "").onChange((value) => this.updateDraft({ [key]: value }));
        });
      }
    });
    const test = (kind: "chat" | "voice" | "web", description: TranslationKey): SettingDefinition => ({
      name: this.t("settings.testConnection"), desc: this.t(description),
      render: (setting) => { setting.addButton((button) => {
        button.setButtonText(this.t("settings.test"));
        button.onClick(() => void this.runTest(kind, button, this.testers[kind]));
      }); }
    });
    return [
      { name: this.t("settings.title"), desc: this.t("settings.intro") },
      control("settings.language", "settings.languageDesc", { type: "dropdown", key: "language", options: { auto: this.t("settings.auto"), en: this.t("settings.english"), "zh-CN": this.t("settings.chinese") } }),
      { type: "group", heading: this.t("settings.chatTitle"), cls: "wisp-settings-card", items: [
        control("settings.provider", "settings.providerDesc", { type: "dropdown", key: "provider", options: { claude: this.t("settings.claude"), "openai-compatible": this.t("settings.openaiCompatible") } }),
        text("model", "settings.model", "settings.modelDesc"),
        secret("apiKey", "settings.apiKey", "settings.apiKeyDesc"),
        control("settings.maxSteps", "settings.maxStepsDesc", { type: "number", key: "maxSteps", min: 0, max: 100, step: 1, defaultValue: 0,
          validate: (value) => Number.isInteger(value) && value >= 0 && value <= 100 ? undefined : this.t("settings.maxStepsInvalid") }),
        text("baseUrl", "settings.baseUrl", "settings.chatBaseUrlDesc"),
        control("settings.systemPrompt", "settings.systemPromptDesc", { type: "textarea", key: "systemPrompt" }),
        test("chat", "settings.testChatDesc")
      ] },
      { type: "group", heading: this.t("settings.voiceTitle"), cls: "wisp-settings-card", items: [
        control("settings.voiceTitle", "settings.voiceDesc", { type: "toggle", key: "voiceEnabled" }),
        control("settings.voiceProvider", "settings.voiceProviderDesc", { type: "dropdown", key: "voiceProvider", options: {
          "openai-compatible": this.t("settings.openaiGroq"), deepgram: this.t("settings.deepgram"), dashscope: this.t("settings.dashscope")
        } }),
        text("voiceModel", "settings.voiceModel", "settings.voiceModelDesc"),
        secret("voiceApiKey", "settings.voiceApiKey", "settings.voiceApiKeyDesc"),
        text("voiceBaseUrl", "settings.voiceBaseUrl", "settings.voiceBaseUrlDesc"),
        test("voice", "settings.testVoiceDesc")
      ] },
      { type: "group", heading: this.t("settings.webTitle"), cls: "wisp-settings-card", items: [
        control("settings.enableWeb", "settings.webDesc", { type: "toggle", key: "webSearchEnabled" }),
        control("settings.webProvider", "settings.webProviderDesc", { type: "dropdown", key: "webSearchProvider", options: { tavily: this.t("settings.tavily"), brave: this.t("settings.brave") } }),
        secret("webSearchApiKey", "settings.webApiKey", "settings.webApiKeyDesc"),
        control("settings.maxResults", "settings.maxResultsDesc", { type: "number", key: "webSearchMaxResults", min: 1, max: 10, step: 1, defaultValue: 5,
          validate: (value) => Number.isInteger(value) && value >= 1 && value <= 10 ? undefined : this.t("settings.maxResultsDesc") }),
        text("webSearchBaseUrl", "settings.webBaseUrl", "settings.webBaseUrlDesc"),
        test("web", "settings.testWebDesc")
      ] },
      { type: "group", heading: this.t("settings.privacyTitle"), cls: "wisp-settings-card", items: [
        control("settings.mobileLayout", "settings.mobileLayoutDesc", { type: "dropdown", key: "mobileLayout", options: { side: this.t("settings.sidePanel"), fullscreen: this.t("settings.fullscreen") } }),
        control("settings.debug", "settings.debugDesc", { type: "toggle", key: "debugMode" }),
        { name: this.t("settings.secretStorage"), desc: this.t("settings.directRequests") },
        { name: this.t("settings.vaultNotSent") }
      ] },
      { name: this.t("settings.save"), searchable: false, render: (setting) => {
        this.statusEl = setting.descEl;
        this.setStatus(this.t(this.dirty ? "settings.unsaved" : "settings.saved"), !this.dirty);
        setting.addButton((button) => {
          this.saveButton = button;
          button.setButtonText(this.t("settings.save")).setCta().setDisabled(!this.dirty).onClick(() => void this.saveDraft());
        });
      } }
    ];
  }

  getControlValue(key: string): unknown {
    const settings = this.draft ?? this.getSettings();
    return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key as keyof WispSettings] : undefined;
  }

  setControlValue(key: string, value: unknown): void {
    const draft = this.draft ?? this.getSettings();
    if (!Object.prototype.hasOwnProperty.call(draft, key)) return;
    if (key === "maxSteps" || key === "webSearchMaxResults") {
      const minimum = key === "maxSteps" ? 0 : 1;
      const maximum = key === "maxSteps" ? 100 : 10;
      if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) return;
    } else if (typeof value !== typeof draft[key as keyof WispSettings]) return;
    if (key === "language" && value !== "auto" && value !== "en" && value !== "zh-CN") return;
    if (key === "provider" && value !== "claude" && value !== "openai-compatible") return;
    if (key === "mobileLayout" && value !== "side" && value !== "fullscreen") return;
    if (key === "voiceProvider") {
      if (value !== "openai-compatible" && value !== "deepgram" && value !== "dashscope") return;
      const before = VOICE_PROVIDER_DEFAULTS[draft.voiceProvider];
      const after = VOICE_PROVIDER_DEFAULTS[value];
      this.updateDraft({ voiceProvider: value,
        ...(draft.voiceBaseUrl === before.baseUrl ? { voiceBaseUrl: after.baseUrl } : {}),
        ...(draft.voiceModel === before.model ? { voiceModel: after.model } : {}) });
    } else if (key === "webSearchProvider") {
      if (value !== "tavily" && value !== "brave") return;
      this.updateDraft({ webSearchProvider: value,
        ...(draft.webSearchBaseUrl === WEB_SEARCH_PROVIDER_DEFAULTS[draft.webSearchProvider].baseUrl ? { webSearchBaseUrl: WEB_SEARCH_PROVIDER_DEFAULTS[value].baseUrl } : {}) });
    } else {
      const normalized = typeof value === "string" && !["systemPrompt", "apiKey", "voiceApiKey", "webSearchApiKey"].includes(key) ? value.trim() : value;
      this.updateDraft({ [key]: normalized });
    }
    if (["language", "voiceProvider", "webSearchProvider"].includes(key)) this.update();
  }

  hide(): void {
    this.draft = undefined;
    this.dirty = false;
    this.saveButton = undefined;
    this.statusEl = undefined;
  }

  private async runTest(kind: "chat" | "voice" | "web", button: ButtonComponent, test: (settings: WispSettings) => Promise<void>): Promise<void> {
    const settings = this.draft ?? this.getSettings();
    const missingMessage = this.getMissingTestMessage(kind, settings);
    if (missingMessage) {
      new Notice(missingMessage);
      return;
    }

    button.setDisabled(true);
    button.setButtonText(this.t("settings.testing"));
    try {
      await test(settings);
      new Notice(this.t("settings.testPassed"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const safeDetail = redactSecrets(detail);
      const message = /\b401\b|\b403\b|authentication/i.test(detail)
        ? this.t("settings.testAuthFailed")
        : this.t("settings.testFailed") + ": " + safeDetail;
      new Notice(message, 8_000);
    } finally {
      button.setDisabled(false);
      button.setButtonText(this.t("settings.test"));
    }
  }

  private getMissingTestMessage(kind: "chat" | "voice" | "web", settings: WispSettings): string | undefined {
    const missing = kind === "chat"
      ? !settings.apiKey.trim() || !settings.baseUrl.trim() || !settings.model.trim()
      : kind === "voice"
        ? !settings.voiceApiKey.trim() || !settings.voiceBaseUrl.trim() || !settings.voiceModel.trim()
        : !settings.webSearchApiKey.trim() || !settings.webSearchBaseUrl.trim();
    if (!missing) return undefined;
    const key: TranslationKey = kind === "chat"
      ? "settings.testChatMissing"
      : kind === "voice"
        ? "settings.testVoiceMissing"
        : "settings.testWebMissing";
    return this.t(key);
  }

  private t(key: Parameters<I18n["t"]>[0], variables?: Record<string, string>): string {
    return this.i18n.t(key, variables);
  }

  private updateDraft(changes: Partial<WispSettings>): void {
    this.draft = { ...(this.draft ?? this.getSettings()), ...changes };
    this.dirty = true;
    if (this.saveButton) this.saveButton.setDisabled(false);
    this.setStatus(this.t("settings.unsaved"), false);
  }

  private async saveDraft(): Promise<void> {
    if (!this.draft || !this.dirty || !this.saveButton) return;
    const previousMobileLayout = this.getSettings().mobileLayout;
    const apiKeyError = getApiKeyInputError(this.draft.apiKey);
    if (apiKeyError) {
      this.setStatus(apiKeyError, false);
      new Notice(apiKeyError);
      return;
    }
    this.saveButton.setDisabled(true);
    this.setStatus(this.t("settings.saving"), false);
    try {
      await this.saveSettings(this.draft);
      this.dirty = false;
      const notice = previousMobileLayout === this.draft.mobileLayout
        ? this.t("settings.savedNotice")
        : this.t("settings.mobileLayoutSavedNotice");
      this.setStatus(notice, true);
      new Notice(notice);
    } catch (error) {
      this.saveButton.setDisabled(false);
      const message = error instanceof Error ? `${this.t("settings.saveFailed")}: ${error.message}` : this.t("settings.saveFailed");
      this.setStatus(message, false);
      new Notice(message);
    }
  }

  private setStatus(text: string, saved: boolean): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    this.statusEl.toggleClass("is-saved", saved);
  }
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readLanguage(value: unknown, fallback: WispLanguage): WispLanguage {
  return value === "auto" || value === "en" || value === "zh-CN" ? value : fallback;
}

function readMobileLayout(value: unknown, fallback: WispLayout): WispLayout {
  return value === "side" || value === "fullscreen" ? value : fallback;
}

function readInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), minimum), maximum) : fallback;
}

function readProvider(value: unknown, fallback: WispProvider): WispProvider {
  return value === "claude" || value === "openai-compatible" ? value : fallback;
}

function readVoiceProvider(value: unknown, fallback: WispVoiceProvider): WispVoiceProvider {
  return value === "openai-compatible" || value === "deepgram" || value === "dashscope" ? value : fallback;
}

function readWebSearchProvider(value: unknown, fallback: WebSearchProviderId): WebSearchProviderId {
  return value === "tavily" || value === "brave" ? value : fallback;
}

function inferProviderFromBaseUrl(value: unknown): WispProvider {
  return typeof value === "string" && value.includes("anthropic.com") ? "claude" : "openai-compatible";
}
