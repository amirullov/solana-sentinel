import { loadConfig } from "@sentinel/config";

const config = loadConfig();
if (!config.PUBLISHER_ENABLED) {
  process.stdout.write("Publisher is disabled by default; no transaction was submitted.\n");
} else {
  throw new Error("On-chain publication is gated until local-validator integration tests pass");
}
