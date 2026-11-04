use anchor_lang::prelude::*;

use crate::{
    constants::{CURRENT_SCHEMA_VERSION, REGISTRY_SEED},
    errors::RegistryError,
    state::RegistryConfig,
};

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + RegistryConfig::INIT_SPACE,
        seeds = [REGISTRY_SEED],
        bump
    )]
    pub registry: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_registry(ctx: Context<InitializeRegistry>, publisher: Pubkey) -> Result<()> {
    require_keys_neq!(
        ctx.accounts.admin.key(),
        publisher,
        RegistryError::AuthoritiesMustDiffer
    );
    require_keys_neq!(
        publisher,
        Pubkey::default(),
        RegistryError::DefaultAuthority
    );

    let registry = &mut ctx.accounts.registry;
    registry.schema_version = CURRENT_SCHEMA_VERSION;
    registry.bump = ctx.bumps.registry;
    registry.admin = ctx.accounts.admin.key();
    registry.publisher = publisher;
    Ok(())
}
