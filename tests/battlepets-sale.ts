import * as anchor from "@coral-xyz/anchor";
import { assert, expect } from "chai";
import type { BattlepetsSale } from "../target/types/battlepets_sale";

describe("battlepets-sale", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const providerProgram = anchor.workspace
    .BattlepetsSale as anchor.Program<BattlepetsSale>;

  const [salePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    providerProgram.programId
  );

  const initialLamports = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);
  const repeatLamports = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);

  const anotherContributorLamports = new anchor.BN(
    0.5 * anchor.web3.LAMPORTS_PER_SOL
  );

  const contributor = anchor.web3.Keypair.generate();

  const contributorProvider = new anchor.AnchorProvider(
    provider.connection,
    new anchor.Wallet(contributor),
    {}
  );
  const contributorProgram = new anchor.Program(
    providerProgram.idl,
    contributorProvider
  );

  it("Sale must not be closed", async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      contributor.publicKey,
      (Number(initialLamports) + Number(repeatLamports)) * 2
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    const [saleAllocationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [contributor.publicKey.toBuffer()],
      providerProgram.programId
    );

    try {
      await contributorProgram.methods
        .addSaleAllocation(initialLamports)
        .accounts({})
        .rpc();
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(anchorError.error.errorMessage, "Sale is closed");
      assert.strictEqual(anchorError.error.errorCode.number, 6000);
    }
  });

  it("Opens sale", async () => {
    await providerProgram.methods
      .openSale()
      .accounts({
        sale: salePda,
        fundRaiser: provider.publicKey,
      })
      .rpc();

    const saleAccount = await providerProgram.account.saleState.fetch(salePda);

    expect(saleAccount.open).to.be.true;
  });

  it("Must be fund raiser to open sale", async () => {
    try {
      await contributorProgram.methods
        .openSale()
        .accounts({
          sale: salePda,
          fundRaiser: contributor.publicKey,
        })
        .rpc();
      assert.ok(false);
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(
        anchorError.error.errorMessage,
        "An address constraint was violated"
      );
      assert.strictEqual(anchorError.error.errorCode.number, 2012);
    }
  });

  it("Buys an initial allocation", async () => {
    const initialSignerLamports = await provider.connection.getBalance(
      contributor.publicKey
    );
    const initialFundRaiserLamports = await provider.connection.getBalance(
      provider.publicKey
    );

    const [saleAllocationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [contributor.publicKey.toBuffer()],
      providerProgram.programId
    );

    await contributorProgram.methods
      .addSaleAllocation(initialLamports)
      .accounts({})
      .rpc();

    const saleAllocationAccount =
      await providerProgram.account.saleAllocationState.fetch(
        saleAllocationPda
      );
    const saleAccount = await providerProgram.account.saleState.fetch(salePda);

    expect(contributor.publicKey.toString()).to.equal(
      saleAllocationAccount.contributor.toString()
    );
    expect(Number(initialLamports)).to.equal(
      Number(saleAllocationAccount.amount)
    );

    expect(Number(initialLamports)).to.equal(Number(saleAccount.amount));

    const finalSignerLamports = await provider.connection.getBalance(
      contributor.publicKey
    );
    const finalFundRaiserLamports = await provider.connection.getBalance(
      provider.publicKey
    );

    expect(finalSignerLamports).to.lessThan(
      initialSignerLamports - Number(initialLamports)
    );
    expect(finalFundRaiserLamports).to.equal(
      initialFundRaiserLamports + Number(initialLamports)
    );
  });

  it("Buys an additional allocation", async () => {
    const initialSignerLamports = await provider.connection.getBalance(
      contributor.publicKey
    );
    const initialFundRaiserLamports = await provider.connection.getBalance(
      provider.publicKey
    );

    const [saleAllocationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [contributor.publicKey.toBuffer()],
      providerProgram.programId
    );

    await contributorProgram.methods
      .addSaleAllocation(repeatLamports)
      .accounts({})
      .rpc();

    const saleAllocationAccount =
      await providerProgram.account.saleAllocationState.fetch(
        saleAllocationPda
      );
    const saleAccount = await providerProgram.account.saleState.fetch(salePda);

    expect(contributor.publicKey.toString()).to.equal(
      saleAllocationAccount.contributor.toString()
    );
    expect(Number(initialLamports) + Number(repeatLamports)).to.equal(
      Number(saleAllocationAccount.amount)
    );

    expect(Number(initialLamports) + Number(repeatLamports)).to.equal(
      Number(saleAccount.amount)
    );

    const finalSignerLamports = await provider.connection.getBalance(
      contributor.publicKey
    );
    const finalFundRaiserLamports = await provider.connection.getBalance(
      provider.publicKey
    );

    expect(finalSignerLamports).to.lessThan(
      initialSignerLamports - Number(repeatLamports)
    );
    expect(finalFundRaiserLamports).to.equal(
      initialFundRaiserLamports + Number(repeatLamports)
    );
  });

  const anotherContributor = anchor.web3.Keypair.generate();

  const anotherContributorProvider = new anchor.AnchorProvider(
    provider.connection,
    new anchor.Wallet(anotherContributor),
    {}
  );
  const anotherContributorProgram = new anchor.Program(
    providerProgram.idl,
    anotherContributorProvider
  );

  it("Another wallet buys an initial allocation", async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      anotherContributor.publicKey,
      Number(anotherContributorLamports) * 2
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    const initialSignerLamports = await provider.connection.getBalance(
      anotherContributor.publicKey
    );
    const initialFundRaiserLamports = await provider.connection.getBalance(
      provider.publicKey
    );

    const [saleAllocationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [anotherContributor.publicKey.toBuffer()],
      providerProgram.programId
    );

    await anotherContributorProgram.methods
      .addSaleAllocation(anotherContributorLamports)
      .accounts({})
      .rpc();

    const saleAllocationAccount =
      await providerProgram.account.saleAllocationState.fetch(
        saleAllocationPda
      );
    const saleAccount = await providerProgram.account.saleState.fetch(salePda);

    expect(anotherContributor.publicKey.toString()).to.equal(
      saleAllocationAccount.contributor.toString()
    );
    expect(Number(anotherContributorLamports)).to.equal(
      Number(saleAllocationAccount.amount)
    );

    expect(
      Number(initialLamports) +
        Number(repeatLamports) +
        Number(anotherContributorLamports)
    ).to.equal(Number(saleAccount.amount));

    const finalSignerLamports = await provider.connection.getBalance(
      anotherContributor.publicKey
    );
    const finalFundRaiserLamports = await provider.connection.getBalance(
      provider.publicKey
    );

    expect(finalSignerLamports).to.lessThan(
      initialSignerLamports - Number(anotherContributorLamports)
    );
    expect(finalFundRaiserLamports).to.equal(
      initialFundRaiserLamports + Number(anotherContributorLamports)
    );
  });

  it("Must have correct fund raiser address", async () => {
    const [saleAllocationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [contributor.publicKey.toBuffer()],
      providerProgram.programId
    );

    try {
      await contributorProgram.methods
        .addSaleAllocation(initialLamports)
        .accounts({})
        .rpc();
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(
        anchorError.error.errorMessage,
        "An address constraint was violated"
      );
      assert.strictEqual(anchorError.error.errorCode.number, 2012);
    }
  });

  it("Must have valid amount", async () => {
    const [contributorSaleAllocationPda] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [contributor.publicKey.toBuffer()],
        providerProgram.programId
      );

    const tooLittleLamports = new anchor.BN(
      0.09 * anchor.web3.LAMPORTS_PER_SOL
    );
    try {
      await contributorProgram.methods
        .addSaleAllocation(tooLittleLamports)
        .accounts({})
        .rpc();
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(
        anchorError.error.errorMessage,
        "Amount must be over minimum sale allocation"
      );
      assert.strictEqual(anchorError.error.errorCode.number, 6001);
    }

    const tooManyLamports = new anchor.BN(
      (4 + 0.01) * anchor.web3.LAMPORTS_PER_SOL
    )
      .sub(initialLamports)
      .sub(repeatLamports);
    try {
      await contributorProgram.methods
        .addSaleAllocation(tooManyLamports)
        .accounts({})
        .rpc();
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(
        anchorError.error.errorMessage,
        "Amount must not reach over maximum sale allocation"
      );
      assert.strictEqual(anchorError.error.errorCode.number, 6002);
    }

    const [anotherContributorSaleAllocationPda] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [anotherContributor.publicKey.toBuffer()],
        providerProgram.programId
      );

    const tooManyTotalLamports = new anchor.BN(
      (6 + 0.01) * anchor.web3.LAMPORTS_PER_SOL
    )
      .sub(initialLamports)
      .sub(repeatLamports)
      .sub(anotherContributorLamports);
    try {
      await anotherContributorProgram.methods
        .addSaleAllocation(tooManyTotalLamports)
        .accounts({})
        .rpc();
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(
        anchorError.error.errorMessage,
        "Amount must not reach over total sale allocation"
      );
      assert.strictEqual(anchorError.error.errorCode.number, 6003);
    }
  });

  it("Closes sale", async () => {
    await providerProgram.methods
      .closeSale()
      .accounts({
        sale: salePda,
        fundRaiser: provider.publicKey,
      })
      .rpc();

    const saleAccount = await providerProgram.account.saleState.fetch(salePda);

    expect(saleAccount.open).to.be.false;
  });

  it("Must be fund raiser to close sale", async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      contributor.publicKey,
      (Number(initialLamports) + Number(repeatLamports)) * 2
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    try {
      await contributorProgram.methods
        .closeSale()
        .accounts({
          sale: salePda,
          fundRaiser: contributor.publicKey,
        })
        .rpc();
      assert.ok(false);
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(
        anchorError.error.errorMessage,
        "An address constraint was violated"
      );
      assert.strictEqual(anchorError.error.errorCode.number, 2012);
    }
  });

  it("Sale must not be closed", async () => {
    const [saleAllocationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [contributor.publicKey.toBuffer()],
      providerProgram.programId
    );

    try {
      await contributorProgram.methods
        .addSaleAllocation(initialLamports)
        .accounts({})
        .rpc();
    } catch (error) {
      assert.isTrue(error instanceof anchor.AnchorError);

      const anchorError: anchor.AnchorError = error;

      assert.strictEqual(anchorError.error.errorMessage, "Sale is closed");
      assert.strictEqual(anchorError.error.errorCode.number, 6000);
    }
  });
});
