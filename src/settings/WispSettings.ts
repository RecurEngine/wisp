import { App, ButtonComponent, Notice, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import { getApiKeyInputError } from "../core/ApiKeyValidation";
import { redactSecrets } from "../core/DebugInfo";
import type { WispVoiceProvider } from "../voice/VoiceProviderRegistry";
import type { WebSearchProviderId } from "../websearch/WebSearchTypes";
import { I18n, type TranslationKey, type WispLanguage } from "../i18n/I18n";

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
    const current = await this.plugin.loadData();
    await this.plugin.saveData({
      ...(isRecord(current) ? current : {}),
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      systemPrompt: settings.systemPrompt,
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
  private saveButton?: HTMLButtonElement;
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

  display(): void {
    this.draft = { ...this.getSettings() };
    this.dirty = false;
    this.render();
  }

  private render(): void {
    const { containerEl } = this;
    const draft = this.draft ?? this.getSettings();
    this.i18n.setLanguage(draft.language);
    containerEl.empty();
    containerEl.addClass("wisp-settings");

    const hero = containerEl.createDiv({ cls: "wisp-settings-hero" });
    const heroCopy = hero.createDiv({ cls: "wisp-settings-hero-copy" });
    new Setting(heroCopy)
      .setName(this.t("settings.title"))
      .setHeading()
      .setClass("wisp-settings-hero-heading");
    heroCopy.createEl("p", { text: this.t("settings.intro") });
    hero.createSpan({ cls: "wisp-settings-byok", text: this.t("settings.byokBadge") });
    this.statusEl = containerEl.createDiv({ cls: "wisp-settings-status", text: this.t("settings.saved") });

    new Setting(containerEl)
      .setName(this.t("settings.language"))
      .setDesc(this.t("settings.languageDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", this.t("settings.auto"))
          .addOption("en", this.t("settings.english"))
          .addOption("zh-CN", this.t("settings.chinese"))
          .setValue(draft.language)
          .onChange((value) => {
            this.updateDraft({ language: value as WispLanguage });
            this.render();
          })
      );

    this.renderCard(containerEl, "message-circle", "settings.chatTitle", "settings.chatDesc", this.chatStatus(), (body) => {
      new Setting(body)
        .setName(this.t("settings.provider"))
        .setDesc(this.t("settings.providerDesc"))
        .addDropdown((dropdown) =>
          dropdown
            .addOption("claude", this.t("settings.claude"))
            .addOption("openai-compatible", this.t("settings.openaiCompatible"))
            .setValue(draft.provider)
            .onChange((value) => this.updateDraft({ provider: value as WispProvider }))
        );
      this.addTextSetting(body, "settings.model", "settings.modelDesc", draft.model, (value) => this.updateDraft({ model: value.trim() }));
      this.addSecretSetting(body, "settings.apiKey", "settings.apiKeyDesc", draft.apiKey, (value) => this.updateDraft({ apiKey: value }));
      this.addAdvanced(body, (advanced) => {
        this.addTextSetting(advanced, "settings.baseUrl", "settings.chatBaseUrlDesc", draft.baseUrl, (value) => this.updateDraft({ baseUrl: value.trim() }));
        new Setting(advanced)
          .setName(this.t("settings.systemPrompt"))
          .setDesc(this.t("settings.systemPromptDesc"))
          .addTextArea((text) => text.setValue(draft.systemPrompt).onChange((value) => this.updateDraft({ systemPrompt: value })));
      });
      this.addTestSetting(body, "settings.testConnection", "settings.testChatDesc", "chat", this.testers.chat);
    });

    this.renderOptionalCard(
      containerEl,
      "mic",
      "settings.voiceTitle",
      "settings.voiceDesc",
      this.voiceStatus(),
      draft.voiceEnabled,
      (enabled) => this.updateDraft({ voiceEnabled: enabled }),
      (body) => {
        new Setting(body)
          .setName(this.t("settings.voiceProvider"))
          .setDesc(this.t("settings.voiceProviderDesc"))
          .addDropdown((dropdown) =>
            dropdown
              .addOption("openai-compatible", this.t("settings.openaiGroq"))
              .addOption("deepgram", this.t("settings.deepgram"))
              .addOption("dashscope", this.t("settings.dashscope"))
              .setValue(draft.voiceProvider)
              .onChange((value) => {
                const provider = value as WispVoiceProvider;
                const previousDefaults = VOICE_PROVIDER_DEFAULTS[draft.voiceProvider];
                const nextDefaults = VOICE_PROVIDER_DEFAULTS[provider];
                this.updateDraft({
                  voiceProvider: provider,
                  ...(draft.voiceBaseUrl === previousDefaults.baseUrl ? { voiceBaseUrl: nextDefaults.baseUrl } : {}),
                  ...(draft.voiceModel === previousDefaults.model ? { voiceModel: nextDefaults.model } : {})
                });
              })
          );
        this.addTextSetting(body, "settings.voiceModel", "settings.voiceModelDesc", draft.voiceModel, (value) => this.updateDraft({ voiceModel: value.trim() }));
        this.addSecretSetting(body, "settings.voiceApiKey", "settings.voiceApiKeyDesc", draft.voiceApiKey, (value) => this.updateDraft({ voiceApiKey: value }));
        this.addAdvanced(body, (advanced) => {
          this.addTextSetting(advanced, "settings.voiceBaseUrl", "settings.voiceBaseUrlDesc", draft.voiceBaseUrl, (value) => this.updateDraft({ voiceBaseUrl: value.trim() }));
        });
        this.addTestSetting(body, "settings.testConnection", "settings.testVoiceDesc", "voice", this.testers.voice);
      }
    );

    this.renderOptionalCard(
      containerEl,
      "globe-2",
      "settings.webTitle",
      "settings.webDesc",
      this.webStatus(),
      draft.webSearchEnabled,
      (enabled) => this.updateDraft({ webSearchEnabled: enabled }),
      (body) => {
        new Setting(body)
          .setName(this.t("settings.webProvider"))
          .setDesc(this.t("settings.webProviderDesc"))
          .addDropdown((dropdown) =>
            dropdown
              .addOption("tavily", this.t("settings.tavily"))
              .addOption("brave", this.t("settings.brave"))
              .setValue(draft.webSearchProvider)
              .onChange((value) => {
                const provider = value as WebSearchProviderId;
                const previousBaseUrl = WEB_SEARCH_PROVIDER_DEFAULTS[draft.webSearchProvider].baseUrl;
                this.updateDraft({
                  webSearchProvider: provider,
                  ...(draft.webSearchBaseUrl === previousBaseUrl ? { webSearchBaseUrl: WEB_SEARCH_PROVIDER_DEFAULTS[provider].baseUrl } : {})
                });
              })
          );
        this.addSecretSetting(body, "settings.webApiKey", "settings.webApiKeyDesc", draft.webSearchApiKey, (value) => this.updateDraft({ webSearchApiKey: value }));
        new Setting(body)
          .setName(this.t("settings.maxResults"))
          .setDesc(this.t("settings.maxResultsDesc"))
          .addText((text) => text.setValue(String(draft.webSearchMaxResults)).onChange((value) => this.updateDraft({ webSearchMaxResults: readInteger(value, 5, 1, 10) })));
        this.addAdvanced(body, (advanced) => {
          this.addTextSetting(advanced, "settings.webBaseUrl", "settings.webBaseUrlDesc", draft.webSearchBaseUrl, (value) => this.updateDraft({ webSearchBaseUrl: value.trim() }));
        });
        this.addTestSetting(body, "settings.testConnection", "settings.testWebDesc", "web", this.testers.web);
      }
    );

    this.renderCard(containerEl, "shield-check", "settings.privacyTitle", "settings.privacyDesc", "settings.ready", (body) => {
      new Setting(body)
        .setName(this.t("settings.mobileLayout"))
        .setDesc(this.t("settings.mobileLayoutDesc"))
        .addDropdown((dropdown) =>
          dropdown
            .addOption("side", this.t("settings.sidePanel"))
            .addOption("fullscreen", this.t("settings.fullscreen"))
            .setValue(draft.mobileLayout)
            .onChange((value) => this.updateDraft({ mobileLayout: value as WispLayout }))
        );
      new Setting(body)
        .setName(this.t("settings.debug"))
        .setDesc(this.t("settings.debugDesc"))
        .addToggle((toggle) => toggle.setValue(draft.debugMode).onChange((value) => this.updateDraft({ debugMode: value })));
      const notes = body.createDiv({ cls: "wisp-settings-notes" });
      for (const key of ["settings.secretStorage", "settings.directRequests", "settings.vaultNotSent"] as const) {
        notes.createDiv({ text: this.t(key) });
      }
    });

    const actions = containerEl.createDiv({ cls: "wisp-settings-actions" });
    this.saveButton = actions.createEl("button", { cls: "mod-cta", text: this.t("settings.save") });
    this.saveButton.disabled = !this.dirty;
    this.saveButton.addEventListener("click", () => void this.saveDraft());
  }

  private renderCard(
    parent: HTMLElement,
    icon: string,
    titleKey: "settings.chatTitle" | "settings.privacyTitle",
    descriptionKey: "settings.chatDesc" | "settings.privacyDesc",
    statusKey: "settings.ready" | "settings.needsSetup" | "settings.disabled",
    renderBody: (body: HTMLElement) => void
  ): void {
    const card = parent.createDiv({ cls: "wisp-settings-card" });
    this.renderCardHeader(card, icon, titleKey, descriptionKey, statusKey);
    const body = card.createDiv({ cls: "wisp-settings-card-body" });
    renderBody(body);
  }

  private renderOptionalCard(
    parent: HTMLElement,
    icon: string,
    titleKey: "settings.voiceTitle" | "settings.webTitle",
    descriptionKey: "settings.voiceDesc" | "settings.webDesc",
    statusKey: "settings.ready" | "settings.needsSetup" | "settings.disabled",
    enabled: boolean,
    onToggle: (enabled: boolean) => void,
    renderBody: (body: HTMLElement) => void
  ): void {
    const card = parent.createDiv({ cls: `wisp-settings-card${enabled ? " is-enabled" : " is-disabled"}` });
    const header = this.renderCardHeader(card, icon, titleKey, descriptionKey, statusKey);
    const toggle = header.createEl("label", { cls: "wisp-settings-toggle" });
    const input = toggle.createEl("input", { attr: { type: "checkbox", "aria-label": this.t(titleKey) } });
    input.checked = enabled;
    toggle.createSpan({ text: enabled ? this.t("settings.enabled") : this.t("settings.enable") });
    input.addEventListener("change", () => {
      onToggle(input.checked);
      this.render();
    });
    if (enabled) renderBody(card.createDiv({ cls: "wisp-settings-card-body" }));
  }

  private renderCardHeader(
    card: HTMLElement,
    icon: string,
    titleKey: "settings.chatTitle" | "settings.voiceTitle" | "settings.webTitle" | "settings.privacyTitle",
    descriptionKey: "settings.chatDesc" | "settings.voiceDesc" | "settings.webDesc" | "settings.privacyDesc",
    statusKey: "settings.ready" | "settings.needsSetup" | "settings.disabled"
  ): HTMLElement {
    const header = card.createDiv({ cls: "wisp-settings-card-header" });
    const iconEl = header.createSpan({ cls: "wisp-settings-card-icon" });
    setIcon(iconEl, icon);
    const copy = header.createDiv({ cls: "wisp-settings-card-copy" });
    new Setting(copy)
      .setName(this.t(titleKey))
      .setHeading()
      .setClass("wisp-settings-card-heading");
    copy.createEl("p", { text: this.t(descriptionKey) });
    header.createSpan({ cls: `wisp-settings-card-status is-${statusKey.replace("settings.", "")}`, text: this.t(statusKey) });
    return header;
  }

  private addTextSetting(parent: HTMLElement, nameKey: "settings.model" | "settings.baseUrl" | "settings.voiceModel" | "settings.voiceBaseUrl" | "settings.webBaseUrl", descKey: "settings.modelDesc" | "settings.chatBaseUrlDesc" | "settings.voiceModelDesc" | "settings.voiceBaseUrlDesc" | "settings.webBaseUrlDesc", value: string, onChange: (value: string) => void): void {
    new Setting(parent).setName(this.t(nameKey)).setDesc(this.t(descKey)).addText((text) => text.setValue(value).onChange(onChange));
  }

  private addSecretSetting(parent: HTMLElement, nameKey: "settings.apiKey" | "settings.voiceApiKey" | "settings.webApiKey", descKey: "settings.apiKeyDesc" | "settings.voiceApiKeyDesc" | "settings.webApiKeyDesc", value: string, onChange: (value: string) => void): void {
    new Setting(parent).setName(this.t(nameKey)).setDesc(this.t(descKey)).addText((text) => {
      text.setValue(value).onChange(onChange);
      text.inputEl.type = "password";
      text.inputEl.autocomplete = "off";
    });
  }

  private addTestSetting(
    parent: HTMLElement,
    nameKey: "settings.testConnection",
    descriptionKey: "settings.testChatDesc" | "settings.testVoiceDesc" | "settings.testWebDesc",
    kind: "chat" | "voice" | "web",
    test: (settings: WispSettings) => Promise<void>
  ): void {
    new Setting(parent)
      .setName(this.t(nameKey))
      .setDesc(this.t(descriptionKey))
      .addButton((button) => {
        button.setButtonText(this.t("settings.test"));
        button.onClick(() => void this.runTest(kind, button, test));
      });
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

  private addAdvanced(parent: HTMLElement, render: (body: HTMLElement) => void): void {
    const details = parent.createEl("details", { cls: "wisp-settings-advanced" });
    details.createEl("summary", { text: this.t("settings.advanced") });
    render(details.createDiv({ cls: "wisp-settings-advanced-body" }));
  }

  private chatStatus(): "settings.ready" | "settings.needsSetup" {
    const draft = this.draft ?? this.getSettings();
    return draft.apiKey.trim() && draft.baseUrl.trim() && draft.model.trim() ? "settings.ready" : "settings.needsSetup";
  }

  private voiceStatus(): "settings.ready" | "settings.needsSetup" | "settings.disabled" {
    const draft = this.draft ?? this.getSettings();
    if (!draft.voiceEnabled) return "settings.disabled";
    return draft.voiceApiKey.trim() && draft.voiceBaseUrl.trim() && draft.voiceModel.trim() ? "settings.ready" : "settings.needsSetup";
  }

  private webStatus(): "settings.ready" | "settings.needsSetup" | "settings.disabled" {
    const draft = this.draft ?? this.getSettings();
    if (!draft.webSearchEnabled) return "settings.disabled";
    return draft.webSearchApiKey.trim() && draft.webSearchBaseUrl.trim() ? "settings.ready" : "settings.needsSetup";
  }

  private t(key: Parameters<I18n["t"]>[0], variables?: Record<string, string>): string {
    return this.i18n.t(key, variables);
  }

  private updateDraft(changes: Partial<WispSettings>): void {
    this.draft = { ...(this.draft ?? this.getSettings()), ...changes };
    this.dirty = true;
    if (this.saveButton) this.saveButton.disabled = false;
    this.setStatus("Unsaved changes.", false);
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
    this.saveButton.disabled = true;
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
      this.saveButton.disabled = false;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
