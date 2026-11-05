import { createHmac } from "node:crypto";
import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

const blockedIpv6 = new BlockList();
blockedIpv6.addSubnet("2001:0::", 32, "ipv6");
blockedIpv6.addSubnet("2001:10::", 28, "ipv6");
blockedIpv6.addSubnet("2001:20::", 28, "ipv6");
blockedIpv6.addSubnet("2001:db8::", 32, "ipv6");
blockedIpv6.addSubnet("2002::", 16, "ipv6");

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) {
    const first = Number.parseInt(address.split(":")[0] ?? "", 16);
    return !(first >= 0x2000 && first <= 0x3fff) || blockedIpv6.check(address, "ipv6");
  }
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a = 0, b = 0, c = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

interface ResolvedWebhook {
  readonly url: URL;
  readonly addresses: readonly { readonly address: string; readonly family: number }[];
}

async function resolveWebhookUrl(value: string): Promise<ResolvedWebhook> {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");
  if (url.username || url.password) throw new Error("Webhook URL cannot contain credentials");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("Webhook hostname resolves to a private or reserved address");
  }
  return { url, addresses };
}

export async function validateWebhookUrl(value: string): Promise<URL> {
  return (await resolveWebhookUrl(value)).url;
}

export async function deliverWebhook(
  urlValue: string,
  payload: unknown,
  signingSecret: string,
  deliveryId: string
): Promise<void> {
  const { url, addresses } = await resolveWebhookUrl(urlValue);
  const body = JSON.stringify(payload);
  const selected = addresses[0];
  if (!selected) throw new Error("Webhook hostname did not resolve");
  await new Promise<void>((resolve, reject) => {
    const outgoing = request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": "solana-sentinel-notifier/0.1",
        "x-sentinel-delivery-id": deliveryId,
        "x-sentinel-signature": `sha256=${createHmac("sha256", signingSecret)
          .update(body)
          .digest("hex")}`
      },
      // Pin the prevalidated address while keeping the original hostname for TLS/SNI.
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family)
    });
    outgoing.setTimeout(10_000, () => outgoing.destroy(new Error("Webhook request timed out")));
    outgoing.once("error", reject);
    outgoing.once("response", (response) => {
      response.resume();
      response.once("error", reject);
      response.once("end", () => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`Webhook returned HTTP ${status}`));
          return;
        }
        resolve();
      });
    });
    outgoing.end(body);
  });
}
