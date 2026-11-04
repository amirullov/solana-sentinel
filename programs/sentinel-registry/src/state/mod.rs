use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RegistryConfig {
    pub schema_version: u16,
    pub bump: u8,
    pub admin: Pubkey,
    pub publisher: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq, InitSpace)]
pub enum Cluster {
    Localnet,
    Devnet,
    Testnet,
    MainnetBeta,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq, InitSpace)]
pub enum FindingKind {
    ProgramUpgraded,
    UpgradeAuthorityChanged,
    WatchedAccountChanged,
}

#[account]
#[derive(InitSpace)]
pub struct Finding {
    pub event_id: [u8; 32],
    pub cluster: Cluster,
    pub kind: FindingKind,
    pub target: Pubkey,
    pub slot: u64,
    pub evidence_hash: [u8; 32],
    pub transaction_signature: [u8; 64],
    pub publisher: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Correction {
    pub correction_id: [u8; 32],
    pub original_event_id: [u8; 32],
    pub corrected_evidence_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub publisher: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

const _: () = {
    assert!(RegistryConfig::INIT_SPACE < 128);
    assert!(Finding::INIT_SPACE < 256);
    assert!(Correction::INIT_SPACE < 256);
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enum_variants_have_stable_one_byte_encoding() {
        assert_eq!(Cluster::Devnet.try_to_vec().unwrap(), vec![1]);
        assert_eq!(FindingKind::ProgramUpgraded.try_to_vec().unwrap(), vec![0]);
    }
}
