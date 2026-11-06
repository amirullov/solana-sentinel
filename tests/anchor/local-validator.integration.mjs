import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import {
  buildInitializeRegistryInstruction,
  buildPublishFindingInstruction,
  decodeFindingAccount,
  decodeRegistryAccount,
  findFindingAddress,
  findRegistryAddress,
  REGISTRY_PROGRAM_ID
} from "@sentinel/registry-sdk";

const rpcUrl = process.env.LOCAL_VALIDATOR_RPC_URL ?? "http://127.0.0.1:8899";
const parsedUrl = new URL(rpcUrl);
if (
  parsedUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)
) {
  throw new Error("Local validator integration tests only accept a loopback HTTP RPC endpoint");
}

const connection = new Connection(rpcUrl, "confirmed");
const programId = REGISTRY_PROGRAM_ID;
const [registryAddress] = findRegistryAddress(programId);

function discriminator(namespace, name) {
  return createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);
}

function bytes32(value) {
  return Buffer.alloc(32, value);
}

function initializeInstruction(admin, publisher) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: registryAddress, isWritable: true, isSigner: false },
      { pubkey: admin, isWritable: true, isSigner: true },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false }
    ],
    data: Buffer.concat([discriminator("global", "initialize_registry"), publisher.toBuffer()])
  });
}

function rotateInstruction(admin, newPublisher) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: registryAddress, isWritable: true, isSigner: false },
      { pubkey: admin, isWritable: false, isSigner: true }
    ],
    data: Buffer.concat([discriminator("global", "rotate_publisher"), newPublisher.toBuffer()])
  });
}

function correctionInstruction({
  correctionId,
  originalEventId,
  originalFindingAddress,
  correctedEvidenceHash,
  reasonHash,
  publisher
}) {
  const [correctionAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("correction"), correctionId],
    programId
  );
  return {
    correctionAddress,
    instruction: new TransactionInstruction({
      programId,
      keys: [
        { pubkey: registryAddress, isWritable: false, isSigner: false },
        { pubkey: originalFindingAddress, isWritable: false, isSigner: false },
        { pubkey: correctionAddress, isWritable: true, isSigner: false },
        { pubkey: publisher, isWritable: true, isSigner: true },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false }
      ],
      data: Buffer.concat([
        discriminator("global", "publish_correction"),
        correctionId,
        originalEventId,
        correctedEvidenceHash,
        reasonHash
      ])
    })
  };
}

function publishInstruction({ eventId, publisher, slot = 42n, evidenceHash = bytes32(0x22) }) {
  return buildPublishFindingInstruction(
    {
      eventId: eventId.toString("hex"),
      cluster: "localnet",
      kind: "PROGRAM_UPGRADED",
      target: publisher,
      slot,
      evidenceHash: evidenceHash.toString("hex"),
      transactionSignature: Buffer.alloc(64, 0x33)
    },
    publisher,
    programId
  );
}

async function send(instruction, signer) {
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [signer], {
    commitment: "confirmed",
    preflightCommitment: "confirmed"
  });
}

async function airdrop(account) {
  const signature = await connection.requestAirdrop(account.publicKey, 5 * LAMPORTS_PER_SOL);
  const confirmation = await connection.confirmTransaction(signature, "confirmed");
  assert.equal(confirmation.value.err, null, "local validator airdrop failed");
}

async function account(address) {
  const info = await connection.getAccountInfo(address, "confirmed");
  assert.ok(info, `account ${address.toBase58()} does not exist`);
  assert.ok(info.owner.equals(programId), "account is not owned by Sentinel registry");
  return info;
}

async function expectRejected(instruction, signer) {
  await assert.rejects(() => send(instruction, signer));
}

test(
  "Sentinel registry enforces local-validator authority and PDA invariants",
  { timeout: 180_000 },
  async (t) => {
    const program = await connection.getAccountInfo(programId, "confirmed");
    assert.ok(
      program?.executable,
      "Start a fresh solana-test-validator with --bpf-program and the built sentinel_registry.so"
    );
    assert.equal(
      await connection.getAccountInfo(registryAddress, "confirmed"),
      null,
      "Start with a fresh validator ledger (--reset)"
    );

    const admin = Keypair.generate();
    const publisher = Keypair.generate();
    const nextPublisher = Keypair.generate();
    const impostor = Keypair.generate();
    for (const signer of [admin, publisher, nextPublisher, impostor]) await airdrop(signer);

    await t.test("rejects equal authorities, then initializes once", async () => {
      await expectRejected(initializeInstruction(admin.publicKey, admin.publicKey), admin);
      assert.equal(await connection.getAccountInfo(registryAddress, "confirmed"), null);
      await send(
        buildInitializeRegistryInstruction(admin.publicKey, publisher.publicKey, programId),
        admin
      );
      const config = decodeRegistryAccount((await account(registryAddress)).data);
      assert.equal(config.schemaVersion, 1);
      assert.ok(config.admin.equals(admin.publicKey));
      assert.ok(config.publisher.equals(publisher.publicKey));
      await expectRejected(
        buildInitializeRegistryInstruction(admin.publicKey, publisher.publicKey, programId),
        admin
      );
    });

    const firstEventId = bytes32(0x11);
    const [firstFindingAddress] = findFindingAddress(firstEventId.toString("hex"), programId);
    await t.test("rejects wrong publisher and wrong finding PDA", async () => {
      await expectRejected(
        publishInstruction({ eventId: firstEventId, publisher: impostor.publicKey }),
        impostor
      );
      assert.equal(await connection.getAccountInfo(firstFindingAddress, "confirmed"), null);

      const instruction = publishInstruction({
        eventId: firstEventId,
        publisher: publisher.publicKey
      });
      instruction.keys[1] = {
        pubkey: Keypair.generate().publicKey,
        isWritable: true,
        isSigner: false
      };
      await expectRejected(instruction, publisher);
      assert.equal(await connection.getAccountInfo(firstFindingAddress, "confirmed"), null);
    });

    await t.test("publishes one immutable finding and rejects duplicate", async () => {
      const instruction = publishInstruction({
        eventId: firstEventId,
        publisher: publisher.publicKey
      });
      await send(instruction, publisher);
      const stored = decodeFindingAccount((await account(firstFindingAddress)).data);
      assert.equal(stored.eventId, firstEventId.toString("hex"));
      assert.ok(stored.publisher.equals(publisher.publicKey));
      assert.equal(stored.slot, 42n);
      assert.equal(stored.evidenceHash, bytes32(0x22).toString("hex"));
      await expectRejected(instruction, publisher);
      assert.equal(
        decodeFindingAccount((await account(firstFindingAddress)).data).evidenceHash,
        stored.evidenceHash
      );
    });

    const correctionId = bytes32(0x44);
    const correction = correctionInstruction({
      correctionId,
      originalEventId: firstEventId,
      originalFindingAddress: firstFindingAddress,
      correctedEvidenceHash: bytes32(0x55),
      reasonHash: bytes32(0x66),
      publisher: publisher.publicKey
    });
    await t.test("rejects forged original reference and records one correction", async () => {
      const mismatched = correctionInstruction({
        correctionId,
        originalEventId: bytes32(0x77),
        originalFindingAddress: firstFindingAddress,
        correctedEvidenceHash: bytes32(0x55),
        reasonHash: bytes32(0x66),
        publisher: publisher.publicKey
      });
      await expectRejected(mismatched.instruction, publisher);
      assert.equal(
        await connection.getAccountInfo(correction.correctionAddress, "confirmed"),
        null
      );
      await send(correction.instruction, publisher);
      const stored = (await account(correction.correctionAddress)).data;
      assert.ok(stored.subarray(0, 8).equals(discriminator("account", "Correction")));
      assert.ok(stored.subarray(8, 40).equals(correctionId));
      assert.ok(stored.subarray(40, 72).equals(firstEventId));
      assert.ok(stored.subarray(72, 104).equals(bytes32(0x55)));
      assert.ok(new PublicKey(stored.subarray(136, 168)).equals(publisher.publicKey));
      await expectRejected(correction.instruction, publisher);
    });

    await t.test("only admin can rotate; old publisher loses access", async () => {
      await expectRejected(
        rotateInstruction(impostor.publicKey, nextPublisher.publicKey),
        impostor
      );
      assert.ok(
        decodeRegistryAccount((await account(registryAddress)).data).publisher.equals(
          publisher.publicKey
        )
      );
      await send(rotateInstruction(admin.publicKey, nextPublisher.publicKey), admin);
      assert.ok(
        decodeRegistryAccount((await account(registryAddress)).data).publisher.equals(
          nextPublisher.publicKey
        )
      );

      const secondEventId = bytes32(0x88);
      const [secondFindingAddress] = findFindingAddress(secondEventId.toString("hex"), programId);
      await expectRejected(
        publishInstruction({ eventId: secondEventId, publisher: publisher.publicKey }),
        publisher
      );
      assert.equal(await connection.getAccountInfo(secondFindingAddress, "confirmed"), null);
      const laterCorrection = correctionInstruction({
        correctionId: bytes32(0x99),
        originalEventId: firstEventId,
        originalFindingAddress: firstFindingAddress,
        correctedEvidenceHash: bytes32(0xaa),
        reasonHash: bytes32(0xbb),
        publisher: publisher.publicKey
      });
      await expectRejected(laterCorrection.instruction, publisher);
      assert.equal(
        await connection.getAccountInfo(laterCorrection.correctionAddress, "confirmed"),
        null
      );

      await send(
        publishInstruction({
          eventId: secondEventId,
          publisher: nextPublisher.publicKey,
          slot: 0xffff_ffff_ffff_ffffn
        }),
        nextPublisher
      );
      const newFinding = decodeFindingAccount((await account(secondFindingAddress)).data);
      assert.ok(newFinding.publisher.equals(nextPublisher.publicKey));
      assert.equal(newFinding.slot, 0xffff_ffff_ffff_ffffn);
    });
  }
);
