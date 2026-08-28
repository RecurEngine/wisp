import { describe, expect, it } from "vitest";
import { I18n } from "../src/i18n/I18n";

describe("I18n", () => {
  it("translates settings copy and interpolates variables", () => {
    const i18n = new I18n("zh-CN");

    expect(i18n.t("settings.byokBadge")).toBe("免费使用 · 自带 Key");
    expect(i18n.t("settings.savedNotice")).toBe("设置已保存。");
    expect(i18n.t("settings.mobileLayoutSavedNotice")).toContain("关闭并重新打开 Wisp");
    expect(i18n.t("settings.sidePanel")).toBe("半屏侧栏");
    expect(i18n.t("view.failed", { error: "Invalid API key" })).toBe("失败：Invalid API key");
  });

  it("can switch language without changing translation keys", () => {
    const i18n = new I18n("en");
    expect(i18n.t("settings.save")).toBe("Save changes");
    expect(i18n.t("settings.fullscreen")).toBe("Full screen");

    i18n.setLanguage("zh-CN");
    expect(i18n.t("settings.save")).toBe("保存修改");
  });
});
