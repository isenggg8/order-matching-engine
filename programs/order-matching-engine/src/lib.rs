use anchor_lang::prelude::*;

pub mod errors;
pub mod state;

pub mod instructions {
    pub mod initialize_market;
    pub mod place_order;
    pub mod cancel_order;
    pub mod match_orders;
    pub mod settle;

    pub use initialize_market::*;
    pub use cancel_order::*;
    pub use place_order::*;
    pub use match_orders::*;
    pub use settle::*;
}

use instructions::*;
use state::OrderSide;

declare_id!("CgG3NfTRRTUcAx5qhCh4LWe1pX79WMBU8M4WfB69MP6j");

#[program]
pub mod order_matching_engine {
    use super::*;

    pub fn initialize_market(ctx: Context<InitializeMarket>, name: String) -> Result<()> {
        instructions::initialize_market::handler(ctx, name)
    }

    pub fn place_order(ctx: Context<PlaceOrder>, side: OrderSide, price: u64, quantity: u64) -> Result<()> {
        instructions::place_order::handler(ctx, side, price, quantity)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        instructions::cancel_order::handler(ctx)
    }

    pub fn match_orders(ctx: Context<MatchOrders>) -> Result<()> {
        instructions::match_orders::handler(ctx)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::settle::handler(ctx)
    }
}
