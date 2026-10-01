import { App, Modal } from "obsidian";
import type { I18n } from "../i18n/I18n";

export type ToolApprovalDecision = "approve" | "approve-all" | "reject";

export class ToolApprovalModal extends Modal {
  private settled = false;
  private removeAbortListener?: () => void;
  private resolveApproval?: (decision: ToolApprovalDecision) => void;

  constructor(app: App, private readonly toolName: string, private readonly args: unknown, private readonly i18n: I18n) {
    super(app);
  }

  openAndWait(signal?: AbortSignal): Promise<ToolApprovalDecision> {
    if (signal?.aborted) return Promise.resolve("reject");
    return new Promise((resolve) => {
      this.resolveApproval = resolve;
      const onAbort = () => this.finish("reject");
      signal?.addEventListener("abort", onAbort, { once: true });
      this.removeAbortListener = () => signal?.removeEventListener("abort", onAbort);
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.i18n.t("modal.approveTitle") });
    contentEl.createEl("p", { text: this.i18n.t("modal.modifyVault", { tool: formatToolName(this.toolName) }) });
    contentEl.createEl("pre", { text: JSON.stringify(this.args, null, 2) });

    const buttons = contentEl.createDiv({ cls: "wisp-approval-buttons" });
    const cancelButton = buttons.createEl("button", { text: this.i18n.t("modal.cancel") });
    const approveAllButton = buttons.createEl("button", { text: this.i18n.t("modal.approveAll") });
    const approveButton = buttons.createEl("button", { cls: "mod-cta", text: this.i18n.t("modal.approve") });
    cancelButton.addEventListener("click", () => this.finish("reject"));
    approveAllButton.addEventListener("click", () => this.finish("approve-all"));
    approveButton.addEventListener("click", () => this.finish("approve"));
  }

  onClose(): void {
    this.finish("reject");
  }

  private finish(decision: ToolApprovalDecision): void {
    if (this.settled) return;
    this.settled = true;
    this.removeAbortListener?.();
    this.resolveApproval?.(decision);
    this.resolveApproval = undefined;
    this.close();
  }
}

function formatToolName(name: string): string {
  return name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
