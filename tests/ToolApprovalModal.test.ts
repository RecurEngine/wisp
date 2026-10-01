import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({
  Modal: class {
    open() {}
    close() { this.onClose(); }
    onClose() {}
  }
}));
import { ToolApprovalModal } from "../src/views/ToolApprovalModal";
import { I18n } from "../src/i18n/I18n";

describe("ToolApprovalModal", () => {
  it("closes and denies a pending approval when the run is stopped", async () => {
    const controller = new AbortController();
    const modal = new ToolApprovalModal({} as never, "append_note", {}, new I18n("en"));
    const close = vi.spyOn(modal, "close");
    const approval = modal.openAndWait(controller.signal);
    controller.abort();
    await expect(Promise.race([approval, Promise.resolve("still waiting")])).resolves.toBe("reject");
    expect(close).toHaveBeenCalled();
  });
});
