import { App, Modal } from "obsidian";
import type { I18n } from "../i18n/I18n";

export class SessionClearHistoryModal extends Modal {
  private settled = false;
  private resolveConfirmation?: (confirmed: boolean) => void;

  constructor(app: App, private readonly title: string, private readonly i18n: I18n) {
    super(app);
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveConfirmation = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.i18n.t("view.clearHistory") });
    contentEl.createEl("p", { text: this.i18n.t("view.clearHistoryConfirm", { title: this.title }) });
    const buttons = contentEl.createDiv({ cls: "wisp-approval-buttons" });
    const cancelButton = buttons.createEl("button", { text: this.i18n.t("modal.cancel") });
    const clearButton = buttons.createEl("button", { cls: "mod-warning", text: this.i18n.t("view.clearHistory") });
    cancelButton.addEventListener("click", () => this.finish(false));
    clearButton.addEventListener("click", () => this.finish(true));
  }

  onClose(): void {
    this.finish(false);
  }

  private finish(confirmed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveConfirmation?.(confirmed);
    this.resolveConfirmation = undefined;
    this.close();
  }
}
