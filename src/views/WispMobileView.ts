import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type { LiteAgentMessage } from "../core/LiteAgentTypes";
import type { LiteAgentRuntime } from "../core/LiteAgentRuntime";
import { formatDebugError, getUserFacingError } from "../core/DebugInfo";
import { insertTranscript } from "./ComposerInput";
import { VoiceRecorder } from "../voice/VoiceRecorder";
import type { TranscriptionProvider } from "../voice/VoiceTypes";
import type { SessionStore } from "../sessions/SessionStore";
import { I18n, type TranslationKey } from "../i18n/I18n";
import { SessionClearHistoryModal } from "./SessionClearHistoryModal";
import { SessionDeleteModal } from "./SessionDeleteModal";
import { SessionRenameModal } from "./SessionRenameModal";

export const VIEW_TYPE_WISP_MOBILE = "wisp-mobile-view";

export interface WispMobileViewDeps {
  readonly createRuntime: () => LiteAgentRuntime | null;
  readonly requestToolApproval: (toolName: string, args: unknown) => Promise<boolean>;
  readonly isDebugMode: () => boolean;
  readonly createTranscriptionProvider: () => TranscriptionProvider | null;
  readonly sessionStore: SessionStore;
  readonly i18n: I18n;
}

export class WispMobileView extends ItemView {
  private inputEl?: HTMLTextAreaElement;
  private transcriptEl?: HTMLElement;
  private statusEl?: HTMLElement;
  private sendButtonEl?: HTMLButtonElement;
  private stopButtonEl?: HTMLButtonElement;
  private micButtonEl?: HTMLButtonElement;
  private cancelRecordingButtonEl?: HTMLButtonElement;
  private recordingStatusEl?: HTMLElement;
  private activeController?: AbortController;
  private recordingTimer?: number;
  private recordingStartedAt?: number;
  private composerBoxEl?: HTMLElement;
  private voiceCaptureEl?: HTMLElement;
  private readonly voiceRecorder = new VoiceRecorder();
  private transcribing = false;
  private history: LiteAgentMessage[] = [];
  private sessionTabsEl?: HTMLElement;
  private draggedTab?: HTMLElement;
  private draggedSessionId?: string;
  private dragPointerId?: number;
  private dragLongPressTimer?: number;
  private dragStartX = 0;
  private suppressTabClickUntil = 0;

  constructor(leaf: WorkspaceLeaf, private readonly deps: WispMobileViewDeps) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_WISP_MOBILE;
  }

  getDisplayText(): string {
    return "Wisp Mobile";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("wisp-mobile-view");

    const shell = container.createDiv({ cls: "wisp-mobile-shell" });
    const header = shell.createDiv({ cls: "wisp-chat-header" });
    const identity = header.createDiv({ cls: "wisp-chat-identity" });
    identity.createDiv({ cls: "wisp-chat-mark", text: "W" });
    const identityCopy = identity.createDiv({ cls: "wisp-chat-identity-copy" });
    identityCopy.createEl("h2", { text: "Wisp" });
    identityCopy.createEl("span", { text: this.t("view.vaultAgent") });
    this.statusEl = header.createEl("span", { cls: "wisp-chat-status", text: this.t("view.ready") });

    this.transcriptEl = shell.createDiv({ cls: "wisp-chat-transcript" });
    this.renderActiveSession();

    const composer = shell.createDiv({ cls: "wisp-chat-composer" });
    this.renderSessionBar(composer);
    const composerBox = composer.createDiv({ cls: "wisp-chat-composer-box" });
    const inputEl = composerBox.createEl("textarea", {
      cls: "wisp-chat-input",
      attr: {
        placeholder: this.t("view.placeholder"),
        rows: "1",
        "aria-label": this.t("view.placeholder")
      }
    });
    this.inputEl = inputEl;
    this.composerBoxEl = composerBox;

    const voiceCapture = composerBox.createDiv({
      cls: "wisp-chat-voice-capture",
      attr: { "aria-live": "polite", "aria-label": this.t("view.listening") }
    });
    const voiceLabel = voiceCapture.createDiv({ cls: "wisp-chat-voice-label" });
    voiceLabel.createSpan({ cls: "wisp-chat-voice-indicator" });
    voiceLabel.createSpan({ text: this.t("view.listening") });
    const waveform = voiceCapture.createDiv({ cls: "wisp-chat-waveform", attr: { "aria-hidden": "true" } });
    for (let index = 0; index < 16; index += 1) waveform.createSpan({ cls: "wisp-chat-waveform-bar" });
    this.recordingStatusEl = voiceCapture.createSpan({
      cls: "wisp-chat-voice-time",
      text: this.t("view.listeningTimer", { time: "00:00" })
    });
    this.voiceCaptureEl = voiceCapture;

    const toolbar = composerBox.createDiv({ cls: "wisp-chat-toolbar" });
    const toolbarMeta = toolbar.createDiv({ cls: "wisp-chat-toolbar-meta" });
    toolbarMeta.createEl("span", { cls: "wisp-chat-hint", text: this.t("view.shortcut") });
    const actions = toolbar.createDiv({ cls: "wisp-chat-actions" });
    const micButton = actions.createEl("button", {
      cls: "wisp-chat-icon-button wisp-chat-mic",
      attr: { type: "button", "aria-label": this.t("view.record"), title: this.t("view.record") }
    });
    setIcon(micButton, "mic");
    const cancelRecordingButton = actions.createEl("button", {
      cls: "wisp-chat-icon-button wisp-chat-cancel-recording",
      attr: { type: "button", "aria-label": this.t("view.cancelRecording"), title: this.t("view.cancelRecording") }
    });
    setIcon(cancelRecordingButton, "x");
    const stopButton = actions.createEl("button", {
      cls: "wisp-chat-icon-button wisp-chat-stop",
      attr: { type: "button", "aria-label": this.t("view.stopGeneration"), title: this.t("view.stopGeneration") }
    });
    setIcon(stopButton, "square");
    const sendButton = actions.createEl("button", {
      cls: "mod-cta wisp-chat-icon-button wisp-chat-send",
      attr: { type: "button", "aria-label": this.t("view.send"), title: this.t("view.send") }
    });
    setIcon(sendButton, "arrow-up");
    this.stopButtonEl = stopButton;
    this.micButtonEl = micButton;
    this.cancelRecordingButtonEl = cancelRecordingButton;
    this.sendButtonEl = sendButton;
    stopButton.disabled = true;
    cancelRecordingButton.disabled = true;

    this.registerDomEvent(sendButton, "click", () => void this.submit());
    this.registerDomEvent(stopButton, "click", () => this.stop());
    this.registerDomEvent(micButton, "click", () => void this.toggleRecording());
    this.registerDomEvent(cancelRecordingButton, "click", () => this.cancelRecording());
    this.registerDomEvent(inputEl, "input", () => {
      this.resizeInput();
      this.updateInputState();
    });
    this.registerDomEvent(inputEl, "keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.submit();
      }
    });
    this.resizeInput();
    this.updateInputState();
  }

  async onClose(): Promise<void> {
    this.stop();
    this.clearDragState();
    this.inputEl = undefined;
    this.transcriptEl = undefined;
    this.statusEl = undefined;
    this.sendButtonEl = undefined;
    this.stopButtonEl = undefined;
    this.micButtonEl = undefined;
    this.cancelRecordingButtonEl = undefined;
    this.recordingStatusEl = undefined;
    this.composerBoxEl = undefined;
    this.voiceCaptureEl = undefined;
    this.sessionTabsEl = undefined;
    this.clearRecordingTimer();
    this.voiceRecorder.cancel();
  }

  private renderSessionBar(shell: HTMLElement): void {
    const sessionBar = shell.createDiv({ cls: "wisp-chat-session-bar" });
    const tabs = sessionBar.createDiv({
      cls: "wisp-chat-session-tabs",
      attr: { role: "tablist", "aria-label": this.t("view.sessions") }
    });
    const actionsButton = sessionBar.createEl("button", {
      cls: "wisp-chat-icon-button wisp-chat-session-actions",
      attr: { type: "button", "aria-label": this.t("view.sessionActions"), title: this.t("view.sessionActions") }
    });
    setIcon(actionsButton, "more-horizontal");
    const newButton = sessionBar.createEl("button", {
      cls: "wisp-chat-icon-button wisp-chat-new-session",
      attr: { type: "button", "aria-label": this.t("view.newSession"), title: this.t("view.newSession") }
    });
    setIcon(newButton, "plus");
    this.sessionTabsEl = tabs;
    this.refreshSessionSelector();
    this.registerDomEvent(actionsButton, "click", (event) => {
      event.stopPropagation();
      this.showSessionMenu(this.deps.sessionStore.active().id, actionsButton);
    });
    this.registerDomEvent(newButton, "click", () => void this.createSession());
  }

  private refreshSessionSelector(): void {
    if (!this.sessionTabsEl) return;
    const active = this.deps.sessionStore.active();
    this.sessionTabsEl.empty();
    for (const session of this.deps.sessionStore.list()) {
      const tab = this.sessionTabsEl.createDiv({
        cls: `wisp-chat-session-tab${session.id === active.id ? " is-active" : ""}`,
        attr: {
          role: "tab",
          "aria-selected": String(session.id === active.id),
          "aria-label": session.title,
          title: session.title
        }
      });
      tab.tabIndex = session.id === active.id ? 0 : -1;
      tab.createSpan({ cls: "wisp-chat-session-tab-title", text: session.title });
      const closeButton = tab.createEl("button", {
        cls: "wisp-chat-session-tab-close",
        text: "×",
        attr: { type: "button", "aria-label": this.t("view.closeSession"), title: this.t("view.closeSession") }
      });
      this.registerDomEvent(closeButton, "click", (event) => {
        event.stopPropagation();
        void this.deleteSession(session.id);
      });
      this.registerDomEvent(tab, "click", () => {
        if (Date.now() < this.suppressTabClickUntil) return;
        void this.switchSession(session.id);
      });
      this.registerDomEvent(tab, "contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showSessionMenu(session.id, undefined, event);
      });
      this.registerTabDragEvents(tab, session.id);
    }
    const activeTab = this.sessionTabsEl.querySelector<HTMLElement>(".wisp-chat-session-tab.is-active");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private registerTabDragEvents(tab: HTMLElement, sessionId: string): void {
    this.registerDomEvent(tab, "pointerdown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest(".wisp-chat-session-tab-close")) return;
      this.cancelPendingTabDrag();
      this.dragStartX = event.clientX;
      this.dragPointerId = event.pointerId;
      const startDrag = () => this.startTabDrag(tab, sessionId, event);
      if (event.pointerType !== "mouse") this.dragLongPressTimer = window.setTimeout(startDrag, 320);
    });
    this.registerDomEvent(tab, "pointermove", (event) => {
      if (event.pointerId !== this.dragPointerId) return;
      if (!this.draggedTab && Math.abs(event.clientX - this.dragStartX) > 8) {
        if (event.pointerType === "mouse") this.startTabDrag(tab, sessionId, event);
        else this.cancelPendingTabDrag();
        return;
      }
      if (this.draggedTab) this.moveDraggedTab(event.clientX);
    });
    this.registerDomEvent(tab, "pointerup", (event) => {
      if (event.pointerId !== this.dragPointerId) return;
      void this.finishTabDrag();
    });
    this.registerDomEvent(tab, "pointercancel", (event) => {
      if (event.pointerId !== this.dragPointerId) return;
      this.cancelPendingTabDrag();
      this.finishTabDrag();
    });
  }

  private startTabDrag(tab: HTMLElement, sessionId: string, event: PointerEvent): void {
    this.cancelPendingTabDrag();
    this.draggedTab = tab;
    this.draggedSessionId = sessionId;
    this.dragPointerId = event.pointerId;
    tab.addClass("is-dragging");
    this.sessionTabsEl?.addClass("is-dragging");
    tab.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private moveDraggedTab(clientX: number): void {
    if (!this.draggedTab || !this.sessionTabsEl) return;
    const tabs = [...this.sessionTabsEl.querySelectorAll<HTMLElement>(".wisp-chat-session-tab")]
      .filter((tab) => tab !== this.draggedTab);
    const target = tabs.find((tab) => clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2);
    if (target) this.sessionTabsEl.insertBefore(this.draggedTab, target);
    else this.sessionTabsEl.appendChild(this.draggedTab);
  }

  private async finishTabDrag(): Promise<void> {
    if (!this.draggedTab || !this.draggedSessionId || !this.sessionTabsEl) {
      this.cancelPendingTabDrag();
      return;
    }
    const draggedTab = this.draggedTab;
    const sessionId = this.draggedSessionId;
    const targetIndex = [...this.sessionTabsEl.querySelectorAll<HTMLElement>(".wisp-chat-session-tab")].indexOf(draggedTab);
    this.suppressTabClickUntil = Date.now() + 350;
    this.clearDragState();
    if (targetIndex >= 0) await this.deps.sessionStore.reorder(sessionId, targetIndex);
    this.refreshSessionSelector();
  }

  private cancelPendingTabDrag(): void {
    if (this.dragLongPressTimer !== undefined) window.clearTimeout(this.dragLongPressTimer);
    this.dragLongPressTimer = undefined;
  }

  private clearDragState(): void {
    this.cancelPendingTabDrag();
    this.draggedTab?.releasePointerCapture?.(this.dragPointerId ?? 0);
    this.draggedTab?.removeClass("is-dragging");
    this.sessionTabsEl?.removeClass("is-dragging");
    this.draggedTab = undefined;
    this.draggedSessionId = undefined;
    this.dragPointerId = undefined;
  }

  private renderActiveSession(): void {
    if (!this.transcriptEl) return;
    this.history = [...this.deps.sessionStore.active().history];
    this.transcriptEl.empty();
    if (this.history.length === 0) {
      this.renderWelcome();
      return;
    }
    for (const message of this.history) {
      if (message.role === "user" || message.role === "assistant") this.appendMessage(message.role, message.content);
    }
    this.scrollToBottom();
  }

  private async createSession(): Promise<void> {
    if (this.activeController || this.transcribing || this.voiceRecorder.isRecording) {
      new Notice(this.t("view.finishBeforeCreate"));
      return;
    }
    await this.deps.sessionStore.create();
    this.refreshSessionSelector();
    this.renderActiveSession();
    this.inputEl?.focus();
  }

  private async switchSession(id: string): Promise<void> {
    if (id === this.deps.sessionStore.active().id) return;
    if (this.activeController || this.transcribing || this.voiceRecorder.isRecording) {
      this.refreshSessionSelector();
      new Notice(this.t("view.finishBeforeSwitch"));
      return;
    }
    if (!(await this.deps.sessionStore.switchTo(id))) return;
    this.refreshSessionSelector();
    this.renderActiveSession();
    this.inputEl?.focus();
  }

  private async deleteSession(id: string): Promise<void> {
    if (this.activeController || this.transcribing || this.voiceRecorder.isRecording) {
      new Notice(this.t("view.finishBeforeSwitch"));
      return;
    }
    const session = this.deps.sessionStore.list().find((candidate) => candidate.id === id);
    if (!session) return;
    if (this.deps.sessionStore.list().length <= 1) {
      new Notice(this.t("view.lastSession"));
      return;
    }
    if (session.history.length > 0 && !(await new SessionDeleteModal(this.app, session.title, this.deps.i18n).openAndWait())) return;
    if (!(await this.deps.sessionStore.delete(id))) return;
    this.refreshSessionSelector();
    this.renderActiveSession();
    this.inputEl?.focus();
  }

  private showSessionMenu(sessionId: string, anchor?: HTMLElement, event?: MouseEvent): void {
    const session = this.deps.sessionStore.list().find((candidate) => candidate.id === sessionId);
    if (!session) return;
    const menu = new Menu()
      .addItem((item) => item
        .setTitle(this.t("view.renameSession"))
        .setIcon("pencil")
        .onClick(() => void this.renameSession(session.id)))
      .addItem((item) => item
        .setTitle(this.t("view.clearHistory"))
        .setIcon("eraser")
        .setDisabled(session.history.length === 0)
        .onClick(() => void this.clearSessionHistory(session.id)))
      .addItem((item) => item
        .setTitle(this.t("view.deleteSession"))
        .setIcon("trash-2")
        .setWarning(true)
        .onClick(() => void this.deleteSession(session.id)));
    if (event) {
      menu.showAtMouseEvent(event);
      return;
    }
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }
  }

  private async clearSessionHistory(id: string): Promise<void> {
    if (this.activeController || this.transcribing || this.voiceRecorder.isRecording) {
      new Notice(this.t("view.finishBeforeSwitch"));
      return;
    }
    const session = this.deps.sessionStore.list().find((candidate) => candidate.id === id);
    if (!session) return;
    if (session.history.length === 0) {
      new Notice(this.t("view.clearHistoryEmpty"));
      return;
    }
    if (!(await new SessionClearHistoryModal(this.app, session.title, this.deps.i18n).openAndWait())) return;
    if (!(await this.deps.sessionStore.clearHistory(id))) return;
    if (id === this.deps.sessionStore.active().id) this.renderActiveSession();
    this.refreshSessionSelector();
    this.inputEl?.focus();
    new Notice(this.t("view.historyCleared"));
  }

  private async renameSession(id: string): Promise<void> {
    if (this.activeController || this.transcribing || this.voiceRecorder.isRecording) {
      new Notice(this.t("view.finishBeforeSwitch"));
      return;
    }
    const session = this.deps.sessionStore.list().find((candidate) => candidate.id === id);
    if (!session) return;
    const title = await new SessionRenameModal(this.app, session.title, this.deps.i18n).openAndWait();
    if (!title) return;
    await this.deps.sessionStore.rename(id, title);
    this.refreshSessionSelector();
  }

  private renderWelcome(): void {
    if (!this.transcriptEl) return;
    const welcome = this.transcriptEl.createDiv({ cls: "wisp-chat-welcome" });
    welcome.createDiv({ cls: "wisp-chat-welcome-mark", text: "W" });
    welcome.createEl("h3", { text: this.t("view.workingOn") });
    welcome.createEl("p", { text: this.t("view.welcome") });
    const examples = welcome.createDiv({ cls: "wisp-chat-examples" });
    for (const example of [this.t("view.findRecent"), this.t("view.readCurrent"), this.t("view.createBrief")]) {
      const button = examples.createEl("button", { text: example });
      this.registerDomEvent(button, "click", () => {
        if (!this.inputEl) return;
        this.inputEl.value = example;
        this.resizeInput();
        this.updateInputState();
        this.inputEl.focus();
      });
    }
  }

  private async submit(): Promise<void> {
    if (this.activeController || this.transcribing || this.voiceRecorder.isRecording) return;
    const input = this.inputEl?.value.trim();
    if (!input) {
      new Notice(this.t("view.enterRequest"));
      return;
    }

    const runtime = this.deps.createRuntime();
    if (!runtime) {
      this.appendError(this.t("view.configureProvider"));
      return;
    }

    const sessionId = this.deps.sessionStore.active().id;
    this.transcriptEl?.querySelector(".wisp-chat-welcome")?.remove();
    this.appendMessage("user", input);
    if (this.inputEl) {
      this.inputEl.value = "";
      this.resizeInput();
      this.updateInputState();
    }
    const assistantBody = this.appendMessage("assistant", "");
    const loadingIndicator = this.appendLoadingIndicator(assistantBody);
    this.scrollToBottom();
    window.requestAnimationFrame(() => this.scrollToBottom());
    const toolStatus = new Map<string, HTMLElement>();
    const controller = new AbortController();
    this.activeController = controller;
    this.setBusy(true);

    let answer = "";
    let requestFailed = false;
    try {
      for await (const event of runtime.run(input, {
        history: this.history,
        signal: controller.signal,
        approveTool: (toolName, args) => this.deps.requestToolApproval(toolName, args)
      })) {
        if (event.type === "text") {
          answer += event.text;
          assistantBody.removeClass("is-loading");
          loadingIndicator.remove();
          assistantBody.appendText(event.text);
          this.scrollToBottom();
        } else if (event.type === "tool_call") {
          const card = this.appendToolCard(event.name, event.arguments);
          toolStatus.set(event.id, card);
          this.scrollToBottom();
        } else if (event.type === "tool_result") {
          const card = toolStatus.get(event.id);
          if (card) {
            card.setText(event.result.ok ? this.t("view.completed") : this.t("view.failed", { error: event.result.error }));
            card.toggleClass("is-error", !event.result.ok);
          }
          if (!event.result.ok && this.deps.isDebugMode()) {
            const details = typeof event.result.details === "string"
              ? event.result.details
              : JSON.stringify(event.result.details);
            this.appendError(this.t("view.errorDetails", { name: event.name, error: event.result.error }), details);
          }
        } else if (event.type === "error") {
          requestFailed = true;
          assistantBody.removeClass("is-loading");
          loadingIndicator.remove();
          assistantBody.setText("I couldn't complete that request.");
          this.appendError(getUserFacingError(event.message), event.details);
        }
      }
      if (!controller.signal.aborted && !requestFailed) {
        this.history.push({ role: "user", content: input }, { role: "assistant", content: answer });
        await this.deps.sessionStore.updateHistory(sessionId, this.history);
        this.refreshSessionSelector();
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        requestFailed = true;
        const message = getUserFacingError(error instanceof Error ? error.message : "Provider request failed");
        this.appendError(message, error instanceof Error ? error.stack : String(error));
      }
    } finally {
      if (requestFailed && this.inputEl?.value.trim() === "") {
        this.inputEl.value = input;
        this.resizeInput();
        this.updateInputState();
      }
      if (this.activeController === controller) this.activeController = undefined;
      assistantBody.removeClass("is-loading");
      loadingIndicator.remove();
      this.setBusy(false);
    }
  }

  private async toggleRecording(): Promise<void> {
    if (this.activeController || this.transcribing) return;
    if (this.voiceRecorder.isRecording) {
      await this.finishRecording();
      return;
    }

    if (!this.deps.createTranscriptionProvider()) {
      new Notice(this.t("view.configureVoice"));
      return;
    }

    try {
      await this.voiceRecorder.start();
      this.setRecording(true);
    } catch (error) {
      const message = this.t("view.microphoneUnavailable", { error: error instanceof Error ? error.message : "permission was denied" });
      new Notice(message);
      if (this.deps.isDebugMode()) this.appendError(message, error instanceof Error ? error.stack : undefined);
    }
  }

  private async finishRecording(): Promise<void> {
    this.setRecording(false);
    this.transcribing = true;
    this.updateMicState();
    this.setStatus(this.t("view.transcribing"), true);
    try {
      const provider = this.deps.createTranscriptionProvider();
      if (!provider) {
        new Notice(this.t("view.configureVoiceBeforeTranscribe"));
        return;
      }
      if (this.inputEl) this.inputEl.disabled = true;
      const existingValue = this.inputEl?.value ?? "";
      const selectionStart = this.inputEl?.selectionStart ?? existingValue.length;
      const selectionEnd = this.inputEl?.selectionEnd ?? selectionStart;
      const transcript = await provider.transcribe(await this.voiceRecorder.stop());
      if (!this.inputEl) return;
      if (!transcript.trim()) {
        new Notice(this.t("view.noSpeech"));
        return;
      }
      this.inputEl.value = insertTranscript(existingValue, transcript, selectionStart, selectionEnd);
      this.resizeInput();
      this.updateInputState();
      this.inputEl.focus();
      new Notice(this.t("view.transcribed"));
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "unknown error";
      const message = /\b401\b|authentication|api key/i.test(rawMessage)
        ? this.t("view.voiceAuthFailed")
        : this.t("view.transcriptionFailed", { error: rawMessage });
      new Notice(message);
      if (this.deps.isDebugMode()) this.appendError(message, error instanceof Error ? error.stack : rawMessage);
    } finally {
      this.transcribing = false;
      if (this.inputEl) this.inputEl.disabled = false;
      this.setStatus(this.t("view.ready"), false);
      this.updateMicState();
      this.updateInputState();
    }
  }

  private appendMessage(role: "user" | "assistant", text: string): HTMLElement {
    if (!this.transcriptEl) return document.createElement("div");
    const message = this.transcriptEl.createDiv({ cls: `wisp-chat-message is-${role}` });
    const meta = message.createDiv({ cls: "wisp-chat-message-meta", text: role === "user" ? this.t("view.you") : this.t("view.wisp") });
    meta.setAttr("aria-hidden", "true");
    return message.createDiv({ cls: "wisp-chat-message-body", text });
  }

  private appendLoadingIndicator(body: HTMLElement): HTMLElement {
    body.addClass("is-loading");
    const indicator = body.createSpan({
      cls: "wisp-chat-loading",
      attr: { role: "status", "aria-label": this.t("view.generating") }
    });
    for (let index = 0; index < 3; index += 1) indicator.createSpan({ cls: "wisp-chat-loading-dot" });
    return indicator;
  }

  private appendToolCard(name: string, args: unknown): HTMLElement {
    if (!this.transcriptEl) return document.createElement("span");
    const card = this.transcriptEl.createDiv({ cls: "wisp-chat-tool" });
    card.createSpan({ cls: "wisp-chat-tool-icon", text: "›" });
    card.createSpan({ cls: "wisp-chat-tool-name", text: formatToolName(name) });
    const status = card.createSpan({ cls: "wisp-chat-tool-status", text: this.t("view.running") });
    card.createEl("pre", { cls: "wisp-chat-tool-args", text: compactArguments(args) });
    return status;
  }

  private appendError(message: string, details?: string): void {
    if (!this.transcriptEl) return;
    const card = this.transcriptEl.createDiv({ cls: "wisp-chat-error" });
    const heading = card.createDiv({ cls: "wisp-chat-error-heading" });
    heading.createSpan({ text: this.t("view.requestFailed") });
    const copyButton = heading.createEl("button", { text: this.t("view.copyError") });
    const copyText = this.deps.isDebugMode() ? formatDebugError(message, details) : message;
    card.createEl("pre", { cls: "wisp-chat-error-text", text: copyText });
    this.registerDomEvent(copyButton, "click", () => void copyError(copyText, this.deps.i18n));
    this.scrollToBottom();
  }

  private setBusy(busy: boolean): void {
    if (this.sendButtonEl) this.sendButtonEl.disabled = busy || this.transcribing || this.voiceRecorder.isRecording || !this.hasInput();
    if (this.stopButtonEl) this.stopButtonEl.disabled = !busy;
    this.stopButtonEl?.toggleClass("is-visible", busy);
    if (this.inputEl) this.inputEl.disabled = this.transcribing;
    this.updateMicState();
    if (this.statusEl) {
      this.setStatus(busy ? this.t("view.working") : this.transcribing ? this.t("view.transcribing") : this.voiceRecorder.isRecording ? this.t("view.listening") : this.t("view.ready"), busy || this.transcribing || this.voiceRecorder.isRecording);
    }
  }

  private setRecording(recording: boolean): void {
    this.composerBoxEl?.toggleClass("is-recording", recording);
    this.voiceCaptureEl?.toggleClass("is-visible", recording);
    if (this.micButtonEl) {
      setIcon(this.micButtonEl, recording ? "square" : "mic");
      this.micButtonEl.toggleClass("is-recording", recording);
      this.micButtonEl.setAttr("aria-label", recording ? this.t("view.finishRecording") : this.t("view.record"));
      this.micButtonEl.setAttr("title", recording ? this.t("view.finishRecording") : this.t("view.record"));
    }
    this.recordingStatusEl?.toggleClass("is-visible", recording);
    this.cancelRecordingButtonEl?.toggleClass("is-visible", recording);
    if (this.cancelRecordingButtonEl) this.cancelRecordingButtonEl.disabled = !recording;
    if (recording) this.startRecordingTimer();
    else this.clearRecordingTimer();
    this.updateInputState();
    if (this.statusEl) this.setStatus(recording ? this.t("view.listening") : this.t("view.ready"), recording);
  }

  private updateMicState(): void {
    if (this.micButtonEl) this.micButtonEl.disabled = Boolean(this.activeController) || this.transcribing;
  }

  private updateInputState(): void {
    if (this.sendButtonEl) {
      this.sendButtonEl.disabled = Boolean(this.activeController) || this.transcribing || this.voiceRecorder.isRecording || !this.hasInput();
    }
  }

  private hasInput(): boolean {
    return Boolean(this.inputEl?.value.trim());
  }

  private resizeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.style.height = "auto";
    const maxHeight = 140;
    const height = Math.min(Math.max(this.inputEl.scrollHeight, 40), maxHeight);
    this.inputEl.style.height = `${height}px`;
    this.inputEl.style.overflowY = this.inputEl.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  private startRecordingTimer(): void {
    this.clearRecordingTimer();
    this.recordingStartedAt = Date.now();
    this.updateRecordingStatus();
    this.recordingTimer = window.setInterval(() => this.updateRecordingStatus(), 1000);
  }

  private updateRecordingStatus(): void {
    if (!this.recordingStatusEl || !this.recordingStartedAt) return;
    const elapsedSeconds = Math.floor((Date.now() - this.recordingStartedAt) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    this.recordingStatusEl.setText(this.t("view.listeningTimer", { time: `${minutes}:${seconds}` }));
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer !== undefined) window.clearInterval(this.recordingTimer);
    this.recordingTimer = undefined;
    this.recordingStartedAt = undefined;
    this.recordingStatusEl?.setText(this.t("view.listeningTimer", { time: "00:00" }));
  }

  private cancelRecording(): void {
    if (!this.voiceRecorder.isRecording) return;
    this.voiceRecorder.cancel();
    this.setRecording(false);
    new Notice(this.t("view.recordingCancelled"));
  }

  private setStatus(text: string, working: boolean): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
    this.statusEl.toggleClass("is-working", working);
  }

  private stop(): void {
    if (this.voiceRecorder.isRecording) {
      this.cancelRecording();
      return;
    }
    this.activeController?.abort();
    this.activeController = undefined;
    this.setBusy(false);
  }

  private scrollToBottom(): void {
    if (this.transcriptEl) this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }

  private t(key: TranslationKey, variables?: Record<string, string>): string {
    return this.deps.i18n.t(key, variables);
  }
}

function formatToolName(name: string): string {
  return name.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactArguments(args: unknown): string {
  const value = JSON.stringify(args);
  return value && value !== "{}" ? value : "";
}

async function copyError(value: string, i18n: I18n): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const fallback = document.createElement("textarea");
      fallback.value = value;
      fallback.setAttribute("readonly", "true");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      let copied = false;
      try {
        fallback.select();
        copied = document.execCommand("copy");
      } finally {
        fallback.remove();
      }
      if (!copied) throw new Error("Clipboard unavailable");
    }
    new Notice(i18n.t("view.errorCopied"));
  } catch {
    new Notice(i18n.t("view.copyFailed"));
  }
}
