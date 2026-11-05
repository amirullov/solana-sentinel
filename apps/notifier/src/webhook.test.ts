import { describe, expect, it } from "vitest";
import { isPrivateAddress, validateWebhookUrl } from "./webhook.js";

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

  it("rejects reserved and tunneled addresses while allowing public IPs", () => {
    for (const address of [
      "192.0.2.1",
      "198.18.0.1",
      "198.51.100.2",
      "203.0.113.3",
      "2001:0db8::1",
      "2002::1",
      "::ffff:127.0.0.1"
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });
});
