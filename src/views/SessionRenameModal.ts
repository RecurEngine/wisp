import { App, Modal, Setting } from "obsidian";
import type { I18n } from "../i18n/I18n";

export class SessionRenameModal extends Modal {
  private settled = false;
  private inputEl?: HTMLInputElement;
  private resolveName?: (name: string | null) => void;

  constructor(app: App, private readonly currentName: string, private readonly i18n: I18n) {
    super(app);
  }

  openAndWait(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveName = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.i18n.t("view.renameSession") });
    new Setting(contentEl)
      .setName(this.i18n.t("view.sessionName"))
      .addText((text) => {
        this.inputEl = text.inputEl;
        text.setValue(this.currentName);
        text.inputEl.select();
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.finish(this.inputEl?.value ?? "");
          }
        });
      });

    const buttons = contentEl.createDiv({ cls: "wisp-approval-buttons" });
    const cancelButton = buttons.createEl("button", { text: this.i18n.t("modal.cancel") });
    const saveButton = buttons.createEl("button", { cls: "mod-cta", text: this.i18n.t("view.saveRename") });
    cancelButton.addEventListener("click", () => this.finish(null));
    saveButton.addEventListener("click", () => this.finish(this.inputEl?.value ?? ""));
  }

  onClose(): void {
    this.finish(null);
  }

  private finish(name: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveName?.(name?.trim() || null);
    this.resolveName = undefined;
    this.close();
  }
}
