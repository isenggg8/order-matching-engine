use anchor_lang::prelude::*;
use crate::state::Market;
use crate::errors::MatchingEngineError;

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeMarket<'info> {
    #[account(
        init, payer = authority, space = Market::LEN,
        seeds = [b"market", base_mint.key().as_ref(), quote_mint.key().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    /// CHECK: used as PDA seed only
    pub base_mint: UncheckedAccount<'info>,
    /// CHECK: used as PDA seed only
    pub quote_mint: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_market_handler(ctx: Context<InitializeMarket>, name: String) -> Result<()> {
    require!(name.len() <= 16, MatchingEngineError::NameTooLong);
    let market = &mut ctx.accounts.market;
    let mut name_bytes = [0u8; 16];
    name_bytes[..name.len()].copy_from_slice(name.as_bytes());
    market.authority = ctx.accounts.authority.key();
    market.name = name_bytes;
    market.base_mint = ctx.accounts.base_mint.key();
    market.quote_mint = ctx.accounts.quote_mint.key();
    market.next_order_id = 1;
    market.total_volume = 0;
    market.best_bid = 0;
    market.best_ask = u64::MAX;
    market.open_orders_count = 0;
    market.is_active = true;
    market.bump = ctx.bumps.market;
    emit!(MarketInitialized {
        market: market.key(),
        name: market.name_str().to_string(),
        base_mint: market.base_mint,
        quote_mint: market.quote_mint,
        authority: market.authority,
    });
    msg!("Market '{}' initialized", market.name_str());
    Ok(())
}

#[event]
pub struct MarketInitialized {
    pub market: Pubkey,
    pub name: String,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub authority: Pubkey,
}
