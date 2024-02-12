use anchor_lang::{prelude::*, system_program};
use solana_program::{pubkey, pubkey::Pubkey, native_token::LAMPORTS_PER_SOL};

declare_id!("8BTZ46tNwx3WfsbG9mF9cb57aHJihgoBoUzEjGkKtPNx");

const FUND_RAISER_PUBLIC_KEY: Pubkey = pubkey!("E8R2i17Pzhy912JcwJ4mXinkv65KsUSHeGUZqjVGJczH");

const SALE_PDA_KEY: &str = "global";

const MIN_INDIVIDUAL_ALLOCATION: u64 = LAMPORTS_PER_SOL / 10;
const MAX_INDIVIDUAL_ALLOCATION: u64 = 4 * LAMPORTS_PER_SOL;
const MAX_TOTAL_ALLOCATION: u64 = 16 * LAMPORTS_PER_SOL;

#[program]
pub mod battlepets_public_sale {
    use super::*;

    pub fn open_sale(ctx: Context<OpenSale>) -> Result<()> {
        let sale: &mut Account<'_, SaleState> = &mut ctx.accounts.sale;

        sale.open = true;

        Ok(())
    }

    pub fn close_sale(ctx: Context<CloseSale>) -> Result<()> {
        let sale: &mut Account<'_, SaleState> = &mut ctx.accounts.sale;

        sale.open = false;

        Ok(())
    }

    pub fn add_sale_allocation(
        ctx: Context<AddSaleAllocation>,
        amount: u64,
    ) -> Result<()> {
        let sale_allocation: &mut Account<'_, SaleAllocationState> = &mut ctx.accounts.sale_allocation;
        let sale: &mut Account<'_, SaleState> = &mut ctx.accounts.sale;

        require!(sale.open, SaleAllocationError::ClosedSale);
        require!(sale_allocation.amount + amount >= MIN_INDIVIDUAL_ALLOCATION, SaleAllocationError::MinIndividualAllocation);
        require!(sale_allocation.amount + amount <= MAX_INDIVIDUAL_ALLOCATION, SaleAllocationError::MaxIndividualAllocation);
        require!(sale.amount + amount <= MAX_TOTAL_ALLOCATION, SaleAllocationError::MaxTotalAllocation);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(), 
                system_program::Transfer {
                    from: ctx.accounts.contributor.to_account_info(),
                    to: ctx.accounts.fund_raiser.to_account_info(),
                }
            ),
            amount
        )?;

        sale_allocation.contributor = ctx.accounts.contributor.key();
        sale_allocation.amount += amount;

        sale.amount += amount;

        Ok(())
    }
}

#[account]
#[derive(Default)]
pub struct SaleState {
    pub open: bool, // 1
    pub amount: u64, // 8
}

#[account]
#[derive(Default)]
pub struct SaleAllocationState {
    pub contributor: Pubkey, // 32
    pub amount: u64, // 8
}

#[derive(Accounts)]
pub struct OpenSale<'info> {
    #[account(
        init_if_needed,
        seeds = [SALE_PDA_KEY.as_bytes()],
        bump,
        payer = fund_raiser,
        space = 8 + 1 + 8
    )]
    pub sale: Account<'info, SaleState>,
    #[account(mut, address = FUND_RAISER_PUBLIC_KEY)]
    pub fund_raiser: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseSale<'info> {
    #[account(
        init_if_needed,
        seeds = [SALE_PDA_KEY.as_bytes()],
        bump,
        payer = fund_raiser,
        space = 8 + 1 + 8
    )]
    pub sale: Account<'info, SaleState>,
    #[account(mut, address = FUND_RAISER_PUBLIC_KEY)]
    pub fund_raiser: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct AddSaleAllocation<'info> {
    #[account(
        init_if_needed,
        seeds = [contributor.key().as_ref()],
        bump,
        payer = contributor,
        space = 8 + 32 + 8
    )]
    pub sale_allocation: Account<'info, SaleAllocationState>,
    #[account(
        init_if_needed,
        seeds = [SALE_PDA_KEY.as_bytes()],
        bump,
        payer = contributor,
        space = 8 + 1 + 8
    )]
    pub sale: Account<'info, SaleState>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(mut, address = FUND_RAISER_PUBLIC_KEY)]
    pub fund_raiser: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
enum SaleAllocationError {
    #[msg("Sale is closed")]
    ClosedSale,
    #[msg("Amount must be over minimum sale allocation")]
    MinIndividualAllocation,
    #[msg("Amount must not reach over maximum sale allocation")]
    MaxIndividualAllocation,
    #[msg("Amount must not reach over total sale allocation")]
    MaxTotalAllocation
}