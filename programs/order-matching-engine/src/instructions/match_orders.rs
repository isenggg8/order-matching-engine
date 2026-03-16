use anchor_lang::prelude::*;
use crate::state::{Market, Order, OrderSide, OrderStatus, UserPosition};
use crate::errors::MatchingEngineError;

#[derive(Accounts)]
pub struct MatchOrders<'info> {
    #[account(
        mut,
        seeds = [b"market", market.base_mint.as_ref(), market.quote_mint.as_ref()],
        bump = market.bump,
        constraint = market.is_active @ MatchingEngineError::MarketInactive,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"order", market.key().as_ref(), &bid_order.order_id.to_le_bytes()],
        bump = bid_order.bump,
        constraint = bid_order.market == market.key(),
        constraint = bid_order.side == OrderSide::Bid,
        constraint = bid_order.is_open() @ MatchingEngineError::OrderNotOpen,
    )]
    pub bid_order: Account<'info, Order>,
    #[account(
        mut,
        seeds = [b"order", market.key().as_ref(), &ask_order.order_id.to_le_bytes()],
        bump = ask_order.bump,
        constraint = ask_order.market == market.key(),
        constraint = ask_order.side == OrderSide::Ask,
        constraint = ask_order.is_open() @ MatchingEngineError::OrderNotOpen,
    )]
    pub ask_order: Account<'info, Order>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), bid_order.trader.as_ref()],
        bump = bid_position.bump,
    )]
    pub bid_position: Account<'info, UserPosition>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), ask_order.trader.as_ref()],
        bump = ask_position.bump,
    )]
    pub ask_position: Account<'info, UserPosition>,
    #[account(constraint = crank.key() == market.crank_authority @ MatchingEngineError::UnauthorizedCrank)]
    pub crank: Signer<'info>,
}

pub fn handler(ctx: Context<MatchOrders>) -> Result<()> {
    let bid = &mut ctx.accounts.bid_order;
    let ask = &mut ctx.accounts.ask_order;
    let market = &mut ctx.accounts.market;
    let bid_pos = &mut ctx.accounts.bid_position;
    let ask_pos = &mut ctx.accounts.ask_position;
    require!(bid.price >= ask.price, MatchingEngineError::NoMatchFound);
    require!(bid.trader != ask.trader, MatchingEngineError::SelfMatchNotAllowed);
    let fill_qty = bid.quantity_remaining.min(ask.quantity_remaining);
    // Fill price = ask.price (maker price), standard LOB convention
    // Bidder gets refunded if bid.price > ask.price
    let fill_price = ask.price;
    let fill_quote = fill_price.checked_mul(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    bid.quantity_filled = bid.quantity_filled.checked_add(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    bid.quantity_remaining = bid.quantity_remaining.checked_sub(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    bid.status = if bid.quantity_remaining == 0 { OrderStatus::Filled } else { OrderStatus::PartiallyFilled };
    ask.quantity_filled = ask.quantity_filled.checked_add(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    ask.quantity_remaining = ask.quantity_remaining.checked_sub(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    ask.status = if ask.quantity_remaining == 0 { OrderStatus::Filled } else { OrderStatus::PartiallyFilled };
    let quote_spent = bid.price.checked_mul(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    let refund = quote_spent.checked_sub(fill_quote).ok_or(MatchingEngineError::Overflow)?;
    bid_pos.quote_locked = bid_pos.quote_locked.checked_sub(quote_spent).ok_or(MatchingEngineError::Overflow)?;
    bid_pos.quote_free = bid_pos.quote_free.checked_add(refund).ok_or(MatchingEngineError::Overflow)?;
    bid_pos.base_free = bid_pos.base_free.checked_add(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    bid_pos.total_base_traded = bid_pos.total_base_traded.checked_add(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    bid_pos.total_quote_traded = bid_pos.total_quote_traded.checked_add(fill_quote).ok_or(MatchingEngineError::Overflow)?;
    ask_pos.base_locked = ask_pos.base_locked.checked_sub(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    ask_pos.quote_free = ask_pos.quote_free.checked_add(fill_quote).ok_or(MatchingEngineError::Overflow)?;
    ask_pos.total_base_traded = ask_pos.total_base_traded.checked_add(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    ask_pos.total_quote_traded = ask_pos.total_quote_traded.checked_add(fill_quote).ok_or(MatchingEngineError::Overflow)?;
    market.total_volume = market.total_volume.checked_add(fill_qty).ok_or(MatchingEngineError::Overflow)?;
    if bid.quantity_remaining == 0 && market.open_orders_count > 0 { market.open_orders_count -= 1; }
    if ask.quantity_remaining == 0 && market.open_orders_count > 0 { market.open_orders_count -= 1; }
    if bid.quantity_remaining == 0 { market.best_bid = 0; }
    if ask.quantity_remaining == 0 { market.best_ask = u64::MAX; }
    emit!(OrdersMatched {
        market: market.key(), bid_order: bid.key(), ask_order: ask.key(),
        bid_trader: bid.trader, ask_trader: ask.trader,
        fill_price, fill_quantity: fill_qty, fill_quote_amount: fill_quote,
    });
    msg!("Matched: bid #{} vs ask #{} — {} @ {} = {}", bid.order_id, ask.order_id, fill_qty, fill_price, fill_quote);
    Ok(())
}

#[event]
pub struct OrdersMatched {
    pub market: Pubkey,
    pub bid_order: Pubkey,
    pub ask_order: Pubkey,
    pub bid_trader: Pubkey,
    pub ask_trader: Pubkey,
    pub fill_price: u64,
    pub fill_quantity: u64,
    pub fill_quote_amount: u64,
}
