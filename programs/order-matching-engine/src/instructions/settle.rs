use anchor_lang::prelude::*;
use crate::state::{Market, UserPosition};

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        seeds = [b"market", market.base_mint.as_ref(), market.quote_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), trader.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.trader == trader.key(),
    )]
    pub user_position: Account<'info, UserPosition>,
    pub trader: Signer<'info>,
}

pub fn handler(ctx: Context<Settle>) -> Result<()> {
    let position = &mut ctx.accounts.user_position;
    let base_to_settle = position.base_free;
    let quote_to_settle = position.quote_free;
    position.base_free = 0;
    position.quote_free = 0;
    emit!(Settled {
        market: ctx.accounts.market.key(),
        trader: ctx.accounts.trader.key(),
        base_settled: base_to_settle,
        quote_settled: quote_to_settle,
    });
    msg!("Settled: {} base + {} quote", base_to_settle, quote_to_settle);
    Ok(())
}

#[event]
pub struct Settled {
    pub market: Pubkey,
    pub trader: Pubkey,
    pub base_settled: u64,
    pub quote_settled: u64,
}
