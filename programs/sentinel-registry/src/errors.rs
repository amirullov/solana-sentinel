use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("The admin and publisher authorities must be different")]
    AuthoritiesMustDiffer,
    #[msg("The authority cannot be the default public key")]
    DefaultAuthority,
    #[msg("The schema version is not supported")]
    UnsupportedSchemaVersion,
    #[msg("The correction does not reference the supplied original finding")]
    OriginalFindingMismatch,
}
