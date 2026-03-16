use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Market {
    pub authority: Pubkey,
    pub name: [u8; 16],
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub next_order_id: u64,
    pub total_volume: u64,
    pub best_bid: u64,
    pub best_ask: u64,
    pub open_orders_count: u64,
    pub is_active: bool,
    pub crank_authority: Pubkey,
    pub bump: u8,
}

impl Market {
    pub const LEN: usize = 8 + 32 + 16 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1 + 32 + 1;

    pub fn name_str(&self) -> &str {
        let end = self.name.iter().position(|&b| b == 0).unwrap_or(16);
        std::str::from_utf8(&self.name[..end]).unwrap_or("???")
    }
}
