import { App, Modal } from "obsidian";
import type { I18n } from "../i18n/I18n";

export class ToolApprovalModal extends Modal {
  private settled = false;
  private resolveApproval?: (approved: boolean) => void;

  constructor(app: App, private readonly toolName: string, private readonly args: unknown, private readonly i18n: I18n) {
    super(app);
  }

  openAndWait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveApproval = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.i18n.t("modal.approveTitle") });
    contentEl.createEl("p", { text: this.i18n.t("modal.modifyVault", { tool: formatToolName(this.toolName) }) });
    contentEl.createEl("pre", { text: JSON.stringify(this.args, null, 2) });

    const buttons = contentEl.createDiv({ cls: "wisp-mobile-approval-buttons" });
    const cancelButton = buttons.createEl("button", { text: this.i18n.t("modal.cancel") });
    const approveButton = buttons.createEl("button", { cls: "mod-cta", text: this.i18n.t("modal.approve") });
    cancelButton.addEventListener("click", () => this.finish(false));
    approveButton.addEventListener("click", () => this.finish(true));
  }

  onClose(): void {
    this.finish(false);
  }

  private finish(approved: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveApproval?.(approved);
    this.resolveApproval = undefined;
    this.close();
  }
}

function formatToolName(name: string): string {
  return name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
