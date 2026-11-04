use anchor_lang::prelude::*;

use crate::{
    constants::{CURRENT_SCHEMA_VERSION, FINDING_SEED, REGISTRY_SEED},
    errors::RegistryError,
    state::{Cluster, Finding, FindingKind, RegistryConfig},
};

#[derive(Accounts)]
#[instruction(event_id: [u8; 32])]
pub struct PublishFinding<'info> {
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        constraint = registry.schema_version == CURRENT_SCHEMA_VERSION @ RegistryError::UnsupportedSchemaVersion
    )]
    pub registry: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = publisher,
        space = 8 + Finding::INIT_SPACE,
        seeds = [FINDING_SEED, event_id.as_ref()],
        bump
    )]
    pub finding: Account<'info, Finding>,
    #[account(mut, address = registry.publisher)]
    pub publisher: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn publish_finding(
    ctx: Context<PublishFinding>,
    event_id: [u8; 32],
    cluster: Cluster,
    kind: FindingKind,
    target: Pubkey,
    slot: u64,
    evidence_hash: [u8; 32],
    transaction_signature: [u8; 64],
) -> Result<()> {
    let finding = &mut ctx.accounts.finding;
    finding.event_id = event_id;
    finding.cluster = cluster;
    finding.kind = kind;
    finding.target = target;
    finding.slot = slot;
    finding.evidence_hash = evidence_hash;
    finding.transaction_signature = transaction_signature;
    finding.publisher = ctx.accounts.publisher.key();
    finding.created_at = Clock::get()?.unix_timestamp;
    finding.bump = ctx.bumps.finding;

    emit!(FindingPublished {
        event_id,
        target,
        slot,
        evidence_hash,
        publisher: finding.publisher,
    });
    Ok(())
}

#[event]
pub struct FindingPublished {
    pub event_id: [u8; 32],
    pub target: Pubkey,
    pub slot: u64,
    pub evidence_hash: [u8; 32],
    pub publisher: Pubkey,
}
