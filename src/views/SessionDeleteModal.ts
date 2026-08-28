import { App, Modal } from "obsidian";
import type { I18n } from "../i18n/I18n";

export class SessionDeleteModal extends Modal {
  private settled = false;
  private resolveDeletion?: (deleted: boolean) => void;

  constructor(app: App, private readonly title: string, private readonly i18n: I18n) {
    super(app);
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveDeletion = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.i18n.t("view.deleteSession") });
    contentEl.createEl("p", { text: this.i18n.t("view.deleteSessionConfirm", { title: this.title }) });
    const buttons = contentEl.createDiv({ cls: "wisp-mobile-approval-buttons" });
    const cancelButton = buttons.createEl("button", { text: this.i18n.t("modal.cancel") });
    const deleteButton = buttons.createEl("button", { cls: "mod-warning", text: this.i18n.t("view.deleteSession") });
    cancelButton.addEventListener("click", () => this.finish(false));
    deleteButton.addEventListener("click", () => this.finish(true));
  }

  onClose(): void {
    this.finish(false);
  }

  private finish(deleted: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveDeletion?.(deleted);
    this.resolveDeletion = undefined;
    this.close();
  }
}
