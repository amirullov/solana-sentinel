const capabilities = [
  ["Program upgrades", "Loader-v3 decoder and replay pipeline"],
  ["Authority changes", "Deterministic event identity and evidence hashes"],
  ["Watched accounts", "Idempotent PostgreSQL event log"],
  ["Attestations", "Anchor registry implemented; deployment not performed"]
] as const;

export default function HomePage() {
  return (
    <main>
      <nav>
        <span className="mark">S</span>
        <span>Solana Sentinel</span>
        <span className="status">Foundation · local only</span>
      </nav>
      <section className="hero">
        <p className="eyebrow">ON-CHAIN SECURITY INTELLIGENCE</p>
        <h1>Critical changes should leave verifiable evidence.</h1>
        <p className="lede">
          Sentinel turns finalized Solana program and account changes into deduplicated facts,
          reproducible evidence bundles and optional on-chain attestations.
        </p>
      </section>
      <section className="grid" aria-label="Current implementation status">
        {capabilities.map(([title, description]) => (
          <article key={title}>
            <span className="dot" />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <section className="notice">
        <strong>Honest status</strong>
        <p>
          This repository is a tested foundation. It is not a running mainnet service, the registry
          has not been deployed, and no build is claimed as verified.
        </p>
      </section>
    </main>
  );
}
