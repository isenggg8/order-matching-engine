use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct UserPosition {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub base_free: u64,
    pub base_locked: u64,
    pub quote_free: u64,
    pub quote_locked: u64,
    pub total_base_traded: u64,
    pub total_quote_traded: u64,
    pub order_count: u64,
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
}
