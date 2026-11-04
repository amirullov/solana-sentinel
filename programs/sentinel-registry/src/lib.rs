use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{Cluster, FindingKind};

// Development-only placeholder. A real Program ID is assigned only at an explicit deployment stage.
declare_id!("Fg6PaFpoGXkYsidMpWxTWqLNZfjpQm5cS2fnQ71kKb4");

#[program]
pub mod sentinel_registry {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>, publisher: Pubkey) -> Result<()> {
        instructions::initialize_registry(ctx, publisher)
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
        instructions::publish_finding(
            ctx,
            event_id,
            cluster,
            kind,
            target,
            slot,
            evidence_hash,
            transaction_signature,
        )
    }

    pub fn rotate_publisher(ctx: Context<RotatePublisher>, new_publisher: Pubkey) -> Result<()> {
        instructions::rotate_publisher(ctx, new_publisher)
    }

    pub fn publish_correction(
        ctx: Context<PublishCorrection>,
        correction_id: [u8; 32],
        original_event_id: [u8; 32],
        corrected_evidence_hash: [u8; 32],
        reason_hash: [u8; 32],
    ) -> Result<()> {
        instructions::publish_correction(
            ctx,
            correction_id,
            original_event_id,
            corrected_evidence_hash,
            reason_hash,
        )
    }
}
