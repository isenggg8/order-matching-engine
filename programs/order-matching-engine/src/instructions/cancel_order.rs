use anchor_lang::prelude::*;
use crate::state::{Market, Order, OrderSide, OrderStatus, UserPosition};
use crate::errors::MatchingEngineError;

#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(
        mut,
        seeds = [b"market", market.base_mint.as_ref(), market.quote_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"order", market.key().as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
        constraint = order.market == market.key(),
        constraint = order.trader == trader.key() @ MatchingEngineError::UnauthorizedCancel,
        constraint = order.is_open() @ MatchingEngineError::OrderNotOpen,
        close = trader
    )]
    pub order: Account<'info, Order>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), trader.key().as_ref()],
        bump = user_position.bump,
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub trader: Signer<'info>,
}

pub fn handler(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.user_position;
    let market = &mut ctx.accounts.market;
    let remaining = order.quantity_remaining;
    match order.side {
        OrderSide::Bid => {
            let locked = order.price.checked_mul(remaining).ok_or(MatchingEngineError::Overflow)?;
            require!(position.quote_locked >= locked, MatchingEngineError::InsufficientLockedBalance);
            position.quote_locked = position.quote_locked.checked_sub(locked).ok_or(MatchingEngineError::Overflow)?;
            position.quote_free = position.quote_free.checked_add(locked).ok_or(MatchingEngineError::Overflow)?;
        }
        OrderSide::Ask => {
            require!(position.base_locked >= remaining, MatchingEngineError::InsufficientLockedBalance);
            position.base_locked = position.base_locked.checked_sub(remaining).ok_or(MatchingEngineError::Overflow)?;
            position.base_free = position.base_free.checked_add(remaining).ok_or(MatchingEngineError::Overflow)?;
        }
    }
    order.status = OrderStatus::Cancelled;
    order.quantity_remaining = 0;
    if market.open_orders_count > 0 { market.open_orders_count -= 1; }
    let order_id = order.order_id;
    let side = order.side;
    emit!(OrderCancelled { market: market.key(), order: order.key(), trader: ctx.accounts.trader.key(), order_id, side, quantity_released: remaining });
    msg!("Order #{} cancelled. Released {} units.", order_id, remaining);
    Ok(())
}

#[event]
pub struct OrderCancelled {
    pub market: Pubkey,
    pub order: Pubkey,
    pub trader: Pubkey,
    pub order_id: u64,
    pub side: OrderSide,
    pub quantity_released: u64,
}
