use anchor_lang::prelude::*;

#[error_code]
pub enum MatchingEngineError {
    #[msg("Market is not active")]
    MarketInactive,
    #[msg("Invalid order quantity: must be greater than zero")]
    InvalidQuantity,
    #[msg("Invalid order price: must be greater than zero")]
    InvalidPrice,
    #[msg("Order is not open")]
    OrderNotOpen,
    #[msg("Only the order's trader can cancel this order")]
    UnauthorizedCancel,
    #[msg("Insufficient locked balance to cancel")]
    InsufficientLockedBalance,
    #[msg("No matching orders found to fill")]
    NoMatchFound,
    #[msg("Market name too long (max 16 bytes)")]
    NameTooLong,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Order already fully filled")]
    AlreadyFilled,
}
