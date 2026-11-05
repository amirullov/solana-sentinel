use anchor_lang::prelude::*;

use crate::{
    constants::{CORRECTION_SEED, CURRENT_SCHEMA_VERSION, FINDING_SEED, REGISTRY_SEED},
    errors::RegistryError,
    state::{Correction, Finding, RegistryConfig},
};

#[derive(Accounts)]
#[instruction(correction_id: [u8; 32], original_event_id: [u8; 32])]
pub struct PublishCorrection<'info> {
    #[account(
        seeds = [REGISTRY_SEED],
        bump = registry.bump,
        constraint = registry.schema_version == CURRENT_SCHEMA_VERSION @ RegistryError::UnsupportedSchemaVersion
    )]
    pub registry: Account<'info, RegistryConfig>,
    #[account(
        seeds = [FINDING_SEED, original_event_id.as_ref()],
        bump = original_finding.bump,
        constraint = original_finding.event_id == original_event_id @ RegistryError::OriginalFindingMismatch
    )]
    pub original_finding: Account<'info, Finding>,
    #[account(
        init,
        payer = publisher,
        space = 8 + Correction::INIT_SPACE,
        seeds = [CORRECTION_SEED, correction_id.as_ref()],
        bump
    )]
    pub correction: Account<'info, Correction>,
    #[account(mut, address = registry.publisher)]
    pub publisher: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn publish_correction(
    ctx: Context<PublishCorrection>,
    correction_id: [u8; 32],
    original_event_id: [u8; 32],
    corrected_evidence_hash: [u8; 32],
    reason_hash: [u8; 32],
) -> Result<()> {
    let correction = &mut ctx.accounts.correction;
    correction.correction_id = correction_id;
    correction.original_event_id = original_event_id;
    correction.corrected_evidence_hash = corrected_evidence_hash;
    correction.reason_hash = reason_hash;
    correction.publisher = ctx.accounts.publisher.key();
    correction.created_at = Clock::get()?.unix_timestamp;
    correction.bump = ctx.bumps.correction;

    emit!(CorrectionPublished {
        correction_id,
        original_event_id,
        corrected_evidence_hash,
        publisher: correction.publisher,
    });
    Ok(())
}

#[event]
pub struct CorrectionPublished {
    pub correction_id: [u8; 32],
    pub original_event_id: [u8; 32],
    pub corrected_evidence_hash: [u8; 32],
    pub publisher: Pubkey,
}
