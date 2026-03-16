use anchor_lang::prelude::*;
use crate::state::{Market, Order, OrderSide, OrderStatus, UserPosition};
use crate::errors::MatchingEngineError;

#[derive(Accounts)]
#[instruction(side: OrderSide, price: u64, quantity: u64)]
pub struct PlaceOrder<'info> {
    #[account(
        mut,
        seeds = [b"market", market.base_mint.as_ref(), market.quote_mint.as_ref()],
        bump = market.bump,
        constraint = market.is_active @ MatchingEngineError::MarketInactive,
    )]
    pub market: Account<'info, Market>,
    #[account(
        init, payer = trader, space = Order::LEN,
        seeds = [b"order", market.key().as_ref(), &market.next_order_id.to_le_bytes()],
        bump
    )]
    pub order: Account<'info, Order>,
    #[account(
        init_if_needed, payer = trader, space = UserPosition::LEN,
        seeds = [b"position", market.key().as_ref(), trader.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut)]
    pub trader: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn place_order_handler(ctx: Context<PlaceOrder>, side: OrderSide, price: u64, quantity: u64) -> Result<()> {
    require!(quantity > 0, MatchingEngineError::InvalidQuantity);
    require!(price > 0, MatchingEngineError::InvalidPrice);
    let market = &mut ctx.accounts.market;
    let order = &mut ctx.accounts.order;
    let position = &mut ctx.accounts.user_position;
    let order_id = market.next_order_id;
    order.market = market.key();
    order.trader = ctx.accounts.trader.key();
    order.order_id = order_id;
    order.side = side;
    order.price = price;
    order.quantity = quantity;
    order.quantity_remaining = quantity;
    order.quantity_filled = 0;
    order.placed_at = Clock::get()?.unix_timestamp;
    order.status = OrderStatus::Open;
    order.bump = ctx.bumps.order;
    if position.market == Pubkey::default() {
        position.market = market.key();
        position.trader = ctx.accounts.trader.key();
        position.bump = ctx.bumps.user_position;
    }
    match side {
        OrderSide::Bid => {
            let locked = price.checked_mul(quantity).ok_or(MatchingEngineError::Overflow)?;
            position.quote_locked = position.quote_locked.checked_add(locked).ok_or(MatchingEngineError::Overflow)?;
        }
        OrderSide::Ask => {
            position.base_locked = position.base_locked.checked_add(quantity).ok_or(MatchingEngineError::Overflow)?;
        }
    }
    position.order_count = position.order_count.checked_add(1).ok_or(MatchingEngineError::Overflow)?;
    market.next_order_id = market.next_order_id.checked_add(1).ok_or(MatchingEngineError::Overflow)?;
    market.open_orders_count = market.open_orders_count.checked_add(1).ok_or(MatchingEngineError::Overflow)?;
    match side {
        OrderSide::Bid => { if price > market.best_bid { market.best_bid = price; } }
        OrderSide::Ask => { if price < market.best_ask { market.best_ask = price; } }
    }
    emit!(OrderPlaced { market: market.key(), order: order.key(), trader: order.trader, order_id, side, price, quantity });
    msg!("Order #{} placed: {} @ {}", order_id, quantity, price);
    Ok(())
}

#[event]
pub struct OrderPlaced {
    pub market: Pubkey,
    pub order: Pubkey,
    pub trader: Pubkey,
    pub order_id: u64,
    pub side: OrderSide,
    pub price: u64,
    pub quantity: u64,
}
