import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { OrderMatchingEngine } from "../target/types/order_matching_engine";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("order-matching-engine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OrderMatchingEngine as Program<OrderMatchingEngine>;
  const authority = provider.wallet as anchor.Wallet;

  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  const trader1 = Keypair.generate();
  const trader2 = Keypair.generate();

  let marketPda: PublicKey;
  let bidOrderPda: PublicKey;
  let askOrderPda: PublicKey;

  const getMarketPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("market"), baseMint.publicKey.toBuffer(), quoteMint.publicKey.toBuffer()],
      program.programId
    );

  const getOrderPda = (orderId: bigint) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        marketPda.toBuffer(),
        Buffer.from(new anchor.BN(orderId.toString()).toArrayLike(Buffer, "le", 8)),
      ],
      program.programId
    );

  const getPositionPda = (trader: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketPda.toBuffer(), trader.toBuffer()],
      program.programId
    );

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(trader1.publicKey, 2_000_000_000)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(trader2.publicKey, 2_000_000_000)
    );
    [marketPda] = getMarketPda();
  });

  // ── Test 1: Initialize Market ───────────────────────────────────────────────

  it("initializes a market", async () => {
    const tx = await program.methods
      .initializeMarket("SOL/USDC")
      .accounts({
        market: marketPda,
        baseMint: baseMint.publicKey,
        quoteMint: quoteMint.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  ✔ initializeMarket tx:", tx);

    const market = await program.account.market.fetch(marketPda);
    expect(market.isActive).to.be.true;
    expect(market.nextOrderId.toString()).to.eq("1");
    expect(market.openOrdersCount.toString()).to.eq("0");
  });

  // ── Test 2: Place Bid ───────────────────────────────────────────────────────

  it("places a bid order", async () => {
    const [orderPda] = getOrderPda(1n);
    bidOrderPda = orderPda;
    const [positionPda] = getPositionPda(trader1.publicKey);

    const tx = await program.methods
      .placeOrder({ bid: {} }, new anchor.BN(100), new anchor.BN(10))
      .accounts({
        market: marketPda,
        order: orderPda,
        userPosition: positionPda,
        trader: trader1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    console.log("  ✔ placeOrder (bid) tx:", tx);

    const order = await program.account.order.fetch(orderPda);
    expect(order.price.toString()).to.eq("100");
    expect(order.quantity.toString()).to.eq("10");
    expect(order.quantityRemaining.toString()).to.eq("10");
    expect(order.side).to.deep.eq({ bid: {} });

    const position = await program.account.userPosition.fetch(positionPda);
    // quote_locked = price * qty = 100 * 10 = 1000
    expect(position.quoteLocked.toString()).to.eq("1000");

    const market = await program.account.market.fetch(marketPda);
    expect(market.bestBid.toString()).to.eq("100");
    expect(market.openOrdersCount.toString()).to.eq("1");
  });

  // ── Test 3: Place Ask ───────────────────────────────────────────────────────

  it("places an ask order", async () => {
    const [orderPda] = getOrderPda(2n);
    askOrderPda = orderPda;
    const [positionPda] = getPositionPda(trader2.publicKey);

    const tx = await program.methods
      .placeOrder({ ask: {} }, new anchor.BN(95), new anchor.BN(5))
      .accounts({
        market: marketPda,
        order: orderPda,
        userPosition: positionPda,
        trader: trader2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader2])
      .rpc();

    console.log("  ✔ placeOrder (ask) tx:", tx);

    const order = await program.account.order.fetch(orderPda);
    expect(order.side).to.deep.eq({ ask: {} });
    expect(order.price.toString()).to.eq("95");

    const position = await program.account.userPosition.fetch(positionPda);
    // base_locked = qty = 5
    expect(position.baseLocked.toString()).to.eq("5");
  });

  // ── Test 4: Match Orders ────────────────────────────────────────────────────

  it("matches bid vs ask (bid.price >= ask.price)", async () => {
    const [bidPositionPda] = getPositionPda(trader1.publicKey);
    const [askPositionPda] = getPositionPda(trader2.publicKey);

    const tx = await program.methods
      .matchOrders()
      .accounts({
        market: marketPda,
        bidOrder: bidOrderPda,
        askOrder: askOrderPda,
        bidPosition: bidPositionPda,
        askPosition: askPositionPda,
        crank: authority.publicKey,
      })
      .rpc();

    console.log("  ✔ matchOrders tx:", tx);

    // fill_qty = min(10, 5) = 5 @ fill_price = 95
    const bidOrder = await program.account.order.fetch(bidOrderPda);
    expect(bidOrder.quantityFilled.toString()).to.eq("5");
    expect(bidOrder.quantityRemaining.toString()).to.eq("5");
    expect(bidOrder.status).to.deep.eq({ partiallyFilled: {} });

    const askOrder = await program.account.order.fetch(askOrderPda);
    expect(askOrder.quantityFilled.toString()).to.eq("5");
    expect(askOrder.quantityRemaining.toString()).to.eq("0");
    expect(askOrder.status).to.deep.eq({ filled: {} });

    // Buyer received 5 base
    const bidPos = await program.account.userPosition.fetch(bidPositionPda);
    expect(bidPos.baseFree.toString()).to.eq("5");

    // Seller received 5 * 95 = 475 quote
    const askPos = await program.account.userPosition.fetch(askPositionPda);
    expect(askPos.quoteFree.toString()).to.eq("475");

    const market = await program.account.market.fetch(marketPda);
    expect(market.totalVolume.toString()).to.eq("5");
  });

  // ── Test 5: Cancel remaining bid ───────────────────────────────────────────

  it("cancels the remaining open bid", async () => {
    const [positionPda] = getPositionPda(trader1.publicKey);

    const tx = await program.methods
      .cancelOrder()
      .accounts({
        market: marketPda,
        order: bidOrderPda,
        userPosition: positionPda,
        trader: trader1.publicKey,
      })
      .signers([trader1])
      .rpc();

    console.log("  ✔ cancelOrder tx:", tx);

    // remaining = 5, locked quote for remaining = 100*5 = 500, released to free
    const pos = await program.account.userPosition.fetch(positionPda);
    expect(pos.quoteFree.toString()).to.eq("500");
    expect(pos.quoteLocked.toString()).to.eq("500"); // original 1000 - 500 consumed by match
  });

  // ── Test 6: Settle ──────────────────────────────────────────────────────────

  it("settles trader2 filled balances", async () => {
    const [positionPda] = getPositionPda(trader2.publicKey);

    const tx = await program.methods
      .settle()
      .accounts({
        market: marketPda,
        userPosition: positionPda,
        trader: trader2.publicKey,
      })
      .signers([trader2])
      .rpc();

    console.log("  ✔ settle tx:", tx);

    const pos = await program.account.userPosition.fetch(positionPda);
    expect(pos.quoteFree.toString()).to.eq("0");
    expect(pos.totalQuoteTraded.toString()).to.eq("475");
  });

  // ── Test 7: Reject price mismatch ──────────────────────────────────────────

  it("rejects match when bid.price < ask.price", async () => {
    const marketState = await program.account.market.fetch(marketPda);
    const nextId = BigInt(marketState.nextOrderId.toString());

    const [bid2Pda] = getOrderPda(nextId);
    const [bid2PosPda] = getPositionPda(trader1.publicKey);

    await program.methods
      .placeOrder({ bid: {} }, new anchor.BN(50), new anchor.BN(3))
      .accounts({
        market: marketPda,
        order: bid2Pda,
        userPosition: bid2PosPda,
        trader: trader1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    const marketState2 = await program.account.market.fetch(marketPda);
    const nextId2 = BigInt(marketState2.nextOrderId.toString());
    const [ask2Pda] = getOrderPda(nextId2);
    const [ask2PosPda] = getPositionPda(trader2.publicKey);

    await program.methods
      .placeOrder({ ask: {} }, new anchor.BN(200), new anchor.BN(3))
      .accounts({
        market: marketPda,
        order: ask2Pda,
        userPosition: ask2PosPda,
        trader: trader2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader2])
      .rpc();

    try {
      await program.methods
        .matchOrders()
        .accounts({
          market: marketPda,
          bidOrder: bid2Pda,
          askOrder: ask2Pda,
          bidPosition: bid2PosPda,
          askPosition: ask2PosPda,
          crank: authority.publicKey,
        })
        .rpc();
      expect.fail("Should have thrown NoMatchFound");
    } catch (err: any) {
      expect(err.message).to.include("NoMatchFound");
      console.log("  ✔ Correctly rejected price mismatch");
    }
  });

  // ── Test 8: Unauthorized cancel ────────────────────────────────────────────

  it("rejects cancel from wrong trader", async () => {
    const marketState = await program.account.market.fetch(marketPda);
    const nextId = BigInt(marketState.nextOrderId.toString());

    const [orderPda] = getOrderPda(nextId);
    const [positionPda] = getPositionPda(trader1.publicKey);

    await program.methods
      .placeOrder({ bid: {} }, new anchor.BN(80), new anchor.BN(2))
      .accounts({
        market: marketPda,
        order: orderPda,
        userPosition: positionPda,
        trader: trader1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader1])
      .rpc();

    const [wrongPosPda] = getPositionPda(trader2.publicKey);
    try {
      await program.methods
        .cancelOrder()
        .accounts({
          market: marketPda,
          order: orderPda,
          userPosition: wrongPosPda,
          trader: trader2.publicKey,
        })
        .signers([trader2])
        .rpc();
      expect.fail("Should have thrown UnauthorizedCancel");
    } catch (err: any) {
      expect(err.message).to.include("UnauthorizedCancel");
      console.log("  ✔ Correctly rejected unauthorized cancel");
    }
  });
});
