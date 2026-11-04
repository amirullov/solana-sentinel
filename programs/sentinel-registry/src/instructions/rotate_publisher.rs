use anchor_lang::prelude::*;

use crate::{constants::REGISTRY_SEED, errors::RegistryError, state::RegistryConfig};

#[derive(Accounts)]
pub struct RotatePublisher<'info> {
    #[account(mut, seeds = [REGISTRY_SEED], bump = registry.bump)]
    pub registry: Account<'info, RegistryConfig>,
    #[account(address = registry.admin)]
    pub admin: Signer<'info>,
}

pub fn rotate_publisher(ctx: Context<RotatePublisher>, new_publisher: Pubkey) -> Result<()> {
    require_keys_neq!(
        new_publisher,
        Pubkey::default(),
        RegistryError::DefaultAuthority
    );
    require_keys_neq!(
        new_publisher,
        ctx.accounts.registry.admin,
        RegistryError::AuthoritiesMustDiffer
    );
    let previous_publisher = ctx.accounts.registry.publisher;
    ctx.accounts.registry.publisher = new_publisher;
    emit!(PublisherRotated {
        previous_publisher,
        new_publisher,
    });
    Ok(())
}

#[event]
pub struct PublisherRotated {
    pub previous_publisher: Pubkey,
    pub new_publisher: Pubkey,
}
