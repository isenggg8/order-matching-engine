use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OrderSide { Bid, Ask }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OrderStatus { Open, PartiallyFilled, Filled, Cancelled }

#[account]
pub struct Order {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub order_id: u64,
    pub side: OrderSide,
    pub price: u64,
    pub quantity: u64,
    pub quantity_remaining: u64,
    pub quantity_filled: u64,
    pub placed_at: i64,
    pub status: OrderStatus,
    pub bump: u8,
}

impl Order {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 1;

    pub fn is_open(&self) -> bool {
        matches!(self.status, OrderStatus::Open | OrderStatus::PartiallyFilled)
    }
}
