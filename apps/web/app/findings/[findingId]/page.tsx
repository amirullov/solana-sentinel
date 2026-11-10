import Link from "next/link";

export const dynamic = "force-dynamic";

interface FindingEvidence {
  finding_id: string;
  event_id: string;
  evidence_hash: string;
  evidence: {
    schema: string;
    eventId: string;
    facts: {
      programAddress?: string;
      sourceHash?: string;
    };
    sources: unknown[];
  };
  event_type: string;
  cluster: string;
  target_address: string;
  signature: string;
  slot: string;
  commitment: string;
  attestation_signature: string | null;
}

async function loadFinding(findingId: string): Promise<{
  finding?: FindingEvidence;
  error?: "unavailable" | "missing";
}> {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100";
  try {
    const response = await fetch(`${api}/v1/findings/${encodeURIComponent(findingId)}/evidence`, {
      cache: "no-store"
    });
    if (response.status === 404) return { error: "missing" };
    if (!response.ok) return { error: "unavailable" };
    const payload = (await response.json()) as { data: FindingEvidence };
    return { finding: payload.data };
  } catch {
    return { error: "unavailable" };
  }
}

function explorerTransaction(signature: string, cluster: string): string | undefined {
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(signature)) return undefined;
  if (cluster === "mainnet-beta") return `https://explorer.solana.com/tx/${signature}`;
  if (cluster === "devnet") return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  return undefined;
}

export default async function FindingPage({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params;
  const { finding, error } = await loadFinding(findingId);
  const transactionUrl = finding
    ? explorerTransaction(finding.signature, finding.cluster)
    : undefined;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100";

  return (
    <main className="detailPage">
      <nav>
        <Link className="brand" href="/">
          <span className="mark">S</span>
          <span>Solana Sentinel</span>
        </Link>
        <span className="status">Evidence inspection · read only</span>
      </nav>
      <Link className="backLink" href="/">
        ← All findings
      </Link>
      {error ? (
        <section className="detailHeader">
          <p className="eyebrow">FINDING</p>
          <h1>{error === "missing" ? "Finding not found" : "Evidence unavailable"}</h1>
          <p className="lede">
            {error === "missing"
              ? "The local API has no finding with this ID."
              : "Start the local API and PostgreSQL, then reload this page."}
          </p>
        </section>
      ) : finding ? (
        <>
          <section className="detailHeader">
            <p className="eyebrow">FINALIZED EVENT · {finding.cluster.toUpperCase()}</p>
            <h1>{finding.event_type.replaceAll("_", " ")}</h1>
            <p className="lede">
              {finding.cluster === "mainnet-beta"
                ? "A historical Solana program change imported into Sentinel. "
                : "A finalized Solana program change recorded by Sentinel. "}
              The stored evidence hash can be recomputed; the event alone does not imply that the
              program is unsafe.
            </p>
          </section>
          <section className="detailGrid" aria-label="Finding details">
            <div>
              <span>Program</span>
              <code>{finding.evidence.facts.programAddress ?? "unknown"}</code>
            </div>
            <div>
              <span>Slot</span>
              <code>{finding.slot}</code>
            </div>
            <div>
              <span>Commitment</span>
              <code>{finding.commitment}</code>
            </div>
            <div>
              <span>Attestation</span>
              <code>
                {finding.attestation_signature ? "published" : "none in this environment"}
              </code>
            </div>
          </section>
          <section className="evidencePanel">
            <div className="feedTitle">
              <strong>Evidence</strong>
              <span>{finding.evidence.schema}</span>
            </div>
            <dl className="evidenceFields">
              <div>
                <dt>Finding ID</dt>
                <dd>{finding.finding_id}</dd>
              </div>
              <div>
                <dt>Event ID</dt>
                <dd>{finding.event_id}</dd>
              </div>
              <div>
                <dt>Evidence SHA-256</dt>
                <dd>{finding.evidence_hash}</dd>
              </div>
              <div>
                <dt>Source hash</dt>
                <dd>{finding.evidence.facts.sourceHash ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Transaction</dt>
                <dd>{finding.signature}</dd>
              </div>
            </dl>
            <div className="evidenceActions">
              {transactionUrl ? (
                <a href={transactionUrl} target="_blank" rel="noopener noreferrer">
                  View transaction in Solana Explorer ↗
                </a>
              ) : null}
              <a
                href={`${api}/v1/findings/${encodeURIComponent(findingId)}/evidence`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open API evidence JSON ↗
              </a>
            </div>
          </section>
          <section className="notice">
            <strong>Verification boundary</strong>
            <p>
              {finding.cluster === "mainnet-beta"
                ? "Sentinel has no mainnet registry or on-chain attestation for this finding. The displayed hash is locally stored; use the portfolio check to recompute the Jupiter case independently."
                : "This page displays locally stored evidence and does not independently verify an on-chain attestation. Use the separate verifier CLI for that check."}
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
