import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, evidenceHash, inspectFindingAccount } from "./verify.mjs";

test("canonical evidence hash ignores object key order", () => {
  const bundle = {
    schema: "solana-sentinel/evidence/v1",
    eventId: "a".repeat(64),
    facts: { b: 2, a: 1 },
    sources: []
  };
  assert.equal(evidenceHash(bundle), evidenceHash({ ...bundle, facts: { a: 1, b: 2 } }));
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("rejects an account without the Finding discriminator", () => {
  assert.throws(() => inspectFindingAccount(Buffer.alloc(219)), /Invalid on-chain/);
});
