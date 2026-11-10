import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hashEvidence } from "../packages/evidence/dist/index.js";

const api = process.env.SENTINEL_API_URL ?? "http://127.0.0.1:4100";
const web = process.env.SENTINEL_WEB_URL ?? "http://127.0.0.1:3000";

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, 200, `${url} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const fixture = JSON.parse(
    await readFile(new URL("../docs/jupiter-mainnet-evidence.json", import.meta.url), "utf8")
  );
  const expected = fixture.findings[0];
  assert.equal(
    hashEvidence(expected.evidence),
    expected.evidenceHash,
    "committed evidence hash differs from its bundle"
  );

  const [status, findings, response] = await Promise.all([
    getJson(`${api}/v1/status`),
    getJson(`${api}/v1/findings`),
    getJson(`${api}/v1/findings/${expected.findingId}/evidence`)
  ]);
  assert.equal(
    status.state,
    "operational",
    `indexer is ${status.state}: ${status.issues.join(", ")}`
  );
  assert.equal(status.claims.mainnetDeployed, false);
  assert.equal(status.claims.verifiedBuild, false);
  assert.ok(findings.data.some((finding) => finding.finding_id === expected.findingId));

  const actual = response.data;
  assert.equal(actual.finding_id, expected.findingId);
  assert.equal(actual.event_id, expected.eventId);
  assert.equal(actual.cluster, "mainnet-beta");
  assert.equal(actual.signature, fixture.signature);
  assert.equal(
    actual.attestation_signature,
    null,
    "mainnet finding unexpectedly has an attestation"
  );
  assert.equal(hashEvidence(actual.evidence), expected.evidenceHash);
  assert.equal(actual.evidence_hash, expected.evidenceHash);

  const [homeResponse, detailResponse] = await Promise.all([
    fetch(web, { signal: AbortSignal.timeout(8000) }),
    fetch(`${web}/findings/${expected.findingId}`, { signal: AbortSignal.timeout(8000) })
  ]);
  assert.equal(homeResponse.status, 200, "dashboard did not load");
  assert.equal(detailResponse.status, 200, "finding details did not load");
  const [home, detail] = await Promise.all([homeResponse.text(), detailResponse.text()]);
  assert.ok(
    home.includes(`/findings/${expected.findingId}`),
    "finding link is missing from dashboard"
  );
  assert.ok(
    detail.includes(expected.evidenceHash),
    "evidence hash is missing from finding details"
  );
  assert.ok(
    detail.includes(fixture.signature),
    "source transaction is missing from finding details"
  );

  process.stdout.write(
    `Portfolio check passed: local mainnet observer operational, Jupiter finding ${expected.findingId}, evidence SHA-256 ${expected.evidenceHash}, dashboard and detail page available.\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `Portfolio check failed: ${error.message}\nStart PostgreSQL, API, indexer (--poll-rpc) and web, then retry.\n`
  );
  process.exitCode = 1;
});
