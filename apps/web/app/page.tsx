export const dynamic = "force-dynamic";

interface FindingRow {
  finding_id: string;
  title: string;
  severity: string;
  event_type: string;
  target_address: string;
  signature: string;
  slot: string;
}

interface StatusResponse {
  state: string;
  checkpoints: Array<{ lag_slots: string }>;
  claims: { mainnetDeployed: boolean; verifiedBuild: boolean };
}

async function loadDashboard(): Promise<{
  findings: FindingRow[];
  status: StatusResponse | undefined;
}> {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4100";
  try {
    const [findingsResponse, statusResponse] = await Promise.all([
      fetch(`${api}/v1/findings`, { cache: "no-store" }),
      fetch(`${api}/v1/status`, { cache: "no-store" })
    ]);
    if (!findingsResponse.ok || !statusResponse.ok) throw new Error("API unavailable");
    const findings = (await findingsResponse.json()) as { data: FindingRow[] };
    return { findings: findings.data, status: (await statusResponse.json()) as StatusResponse };
  } catch {
    return { findings: [], status: undefined };
  }
}

function short(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export default async function HomePage() {
  const { findings, status } = await loadDashboard();
  const maxLag = Math.max(0, ...(status?.checkpoints.map((item) => Number(item.lag_slots)) ?? []));
  const capabilities = [
    ["Findings", String(findings.length)],
    ["Indexer", status?.state ?? "offline"],
    ["Finalized lag", status ? `${maxLag} slots` : "unknown"],
    ["Registry", status?.claims.mainnetDeployed ? "mainnet" : "not deployed"]
  ] as const;

  return (
    <main>
      <nav>
        <span className="mark">S</span>
        <span>Solana Sentinel</span>
        <span className="status">Devnet-ready · mainnet not deployed</span>
      </nav>
      <section className="hero">
        <p className="eyebrow">ON-CHAIN SECURITY INTELLIGENCE</p>
        <h1>Critical changes should leave verifiable evidence.</h1>
        <p className="lede">
          Finalized Solana program and account changes become deduplicated facts, reproducible
          evidence bundles and, after an explicit release gate, on-chain attestations.
        </p>
      </section>
      <section className="grid" aria-label="Runtime status">
        {capabilities.map(([title, value]) => (
          <article key={title}>
            <span className="dot" />
            <h2>{title}</h2>
            <p>{value}</p>
          </article>
        ))}
      </section>
      <section className="feed">
        <div className="feedTitle">
          <strong>Finalized security findings</strong>
          <span>{status ? "Live API" : "API unavailable"}</span>
        </div>
        {findings.length === 0 ? (
          <p className="empty">No persisted findings are available in the connected environment.</p>
        ) : (
          findings.slice(0, 20).map((finding) => (
            <div className="finding" key={finding.finding_id}>
              <span className={`severity severity-${finding.severity}`}>{finding.severity}</span>
              <div>
                <strong>{finding.title}</strong>
                <p>
                  {short(finding.target_address)} · slot {finding.slot} · tx{" "}
                  {short(finding.signature)}
                </p>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="notice">
        <strong>Verification boundary</strong>
        <p>
          An attestation proves which evidence hash a publisher committed. It does not prove that a
          protocol is safe. This environment makes no mainnet or verified-build claim.
        </p>
      </section>
    </main>
  );
}
