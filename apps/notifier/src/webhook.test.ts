import { describe, expect, it } from "vitest";
import { validateWebhookUrl } from "./webhook.js";

describe("webhook destination policy", () => {
  it("rejects non-HTTPS and literal private addresses", async () => {
    await expect(validateWebhookUrl("http://example.com/hook")).rejects.toThrow("HTTPS");
    await expect(validateWebhookUrl("https://127.0.0.1/hook")).rejects.toThrow("private");
  });

  it("rejects embedded credentials before delivery", async () => {
    await expect(validateWebhookUrl("https://user:pass@example.com/hook")).rejects.toThrow(
      "credentials"
    );
  });
});
