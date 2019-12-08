/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {
  WorkerPool,
  Chain,
  Mempool,
  Miner,
  protocol,
  MTX,
  blockstore
} = require('bcoin');
const MemWallet = require('./utils/memwallet');
const {getLogger, p2pkhSignatureInputs, testdir} = require('./utils/common');
const {Path, DeviceManager, vendors} = require('../lib/bsigner');

/*
 * test signing
 * NOTE: ledger firmware doesn't fully sign
 * the transaction if there are both segwit and
 * legacy inputs in the same transaction
 *
 * TODO: trezor testing
 */

/*
 * test globals
 * initialize hardware in the before clause
 * and get an address to give to the miner
 */
let manager;

// MemWallet instance globals
// with and without segwit
let wallet;
let witwallet;

// network global, used to render correct xpubs
const network = 'regtest';

// paths for bip44 account xpubs
// use different accounts so that utxos
// can be separated
const path = Path.fromList([44, 1, 0], true);
const witpath = Path.fromList([44, 1, 1], true);

/*
 * globals for key generation in before hook
 * each will have a standard key and a
 * witness key
 */
const keys = {
  standard: {},
  witness: {}
};

// global instance of a logger
// can be passed to Manager instance
const logger = getLogger();

/*
 * create a worker pool to make
 * everything go faster
 */
const workers = new WorkerPool({
  enabled: true
});

/**
 * Testdir is required for blocks,
 * but it wont be used because we are
 * using memory: true.
 */

const location = testdir('blockstore');

/**
 * Blockstore is necessary for new bcoin Chain
 */

const blocks = blockstore.create({
  memory: true,
  network,
  prefix: location,
  logger
});

/*
 * create an in memory chain
 * to share with the miner
 * and the mempool
 * be sure to set the newtork
 * so that it can be shared with
 * the miner
 */
const chain = new Chain({
  memory: true,
  blocks,
  logger,
  workers,
  network
});

/*
 * create a mempool to send
 * transactions to, for the
 * miner to create block
 * templates from
 */
const mempool = new Mempool({
  chain,
  memory: true,
  workers
});

/*
 * create a miner to create blocks
 * and new utxos
 */
const miner = new Miner({
  chain,
  version: 4,
  workers
});

/*
 * add the block to the wallet to index
 * the coins, transactions and paths
 */
chain.on('connect', async (entry, block, view) => {
  wallet.addBlock(entry, block.txs);
  witwallet.addBlock(entry, block.txs);
});

/*
 * be sure to have the same substring
 * in any test that mines with a test
 * that depends on the mining happening,
 * so that you can target specific tests
 * to run only and still have things work
 */
describe('Signing Transactions', function () {
  this.timeout(1e7);

  // start up a chain and mine some blocks
  // to an address from Signer
  before(async () => {
    // allow for spending coinbase outputs immediately
    protocol.consensus.COINBASE_MATURITY = 0;
    // only 1 BTC per block to force
    // transactions to use many inputs
    protocol.consensus.BASE_REWARD = Number(protocol.consensus.COIN);

    await logger.open();
    await workers.open();
    await blocks.open();
    await chain.open();
    await mempool.open();

    manager = DeviceManager.fromOptions({
      vendor: vendors.LEDGER,
      network,
      logger,
      [vendors.LEDGER]: {
        timeout: 0
      }
    });

    await manager.open();
    await manager.selectDevice(vendors.LEDGER);

    /*
     * NOTE: assignment to a global
     * get xpub and bcoin.HDPublicKey
     * for p2pkh, p2wpkh
     */
    {
      // standard p2pkh transactions
      const hdpubkey = await manager.getPublicKey(path);
      const xpub = hdpubkey.xpubkey(network);
      keys.standard.xpub = xpub;
      keys.standard.hdpubkey = hdpubkey;
    }
    {
      // standard p2wpkh transactions
      const hdpubkey = await manager.getPublicKey(witpath);
      const xpub = hdpubkey.xpubkey(network);
      keys.witness.xpub = xpub;
      keys.witness.hdpubkey = hdpubkey;
    }

    /*
     * NOTE: assignment to a global
     * create a standard wallet to fund
     * transactions
     */
    wallet = new MemWallet({
      network,
      xpub: keys.standard.xpub,
      witness: false,
      watchOnly: true,
      receiveDepth: 5
    });

    /*
     * NOTE: assignment to a global
     * create a segwit wallet to
     * fund transactions
     */
    witwallet = new MemWallet({
      network,
      xpub: keys.witness.xpub,
      watchOnly: true,
      witness: true,
      receiveDepth: 5
    });
  });

  // be sure to close the hardware after the tests
  after(async () => {
    await manager.close();
  });

  it('should mine blocks to the standard wallet', async () => {
    for (let i = 0; i < 3; i++) {
      miner.addresses = [wallet.getReceive()];
      const block = await miner.mineBlock();
      assert(await chain.add(block));
    }
    assert.ok(true);
  });

  it('should mine blocks to the segwit wallet', async () => {
    for (let i = 0; i < 5; i++) {
      miner.addresses = [witwallet.getReceive()];
      const block = await miner.mineBlock();
      assert(await chain.add(block));
    }
    assert.ok(true);
  });

  it('should sign tx with 1 input with ledger', async () => {
    const mtx = new MTX();
    mtx.addOutput({
      value: protocol.consensus.COIN,
      address: wallet.getChange()
    });

    await wallet.fund(mtx, {
      selection: 'random'
    });

    const {paths, inputTXs, coins} =
      p2pkhSignatureInputs(mtx, wallet, path.clone());

    const signed = await manager.signTransaction(mtx, {
      paths,
      inputTXs,
      coins
    });

    // verify the transaction
    assert.ok(signed.verify());
  });

  /*
   * note that this test uses the witwallet
   */
  it('should sign a tx with segwit inputs', async () => {
    const mtx = new MTX();
    mtx.addOutput({
      value: protocol.consensus.COIN,
      address: witwallet.getChange()
    });
    mtx.addOutput({
      value: protocol.consensus.COIN,
      address: witwallet.getChange()
    });

    await witwallet.fund(mtx, {
      selection: 'random'
    });

    const {paths, inputTXs, coins} =
      p2pkhSignatureInputs(mtx, witwallet, witpath.clone());

    const signed = await manager.signTransaction(mtx, {
      paths,
      inputTXs,
      coins
    });

    // verify the transaction
    assert.ok(signed.verify());
  });

  /*
   * the goal is to make sure that inputs
   * from different paths work
   * note that this test uses the wallet
   */
  it('should sign tx with many inputs with ledger', async () => {
    for (let i = 0; i < 5; i++) {
      miner.addresses = [wallet.getReceive()];
      const block = await miner.mineBlock();
      assert(await chain.add(block));
    }

    const mtx = new MTX();
    for (let i = 0; i < 5; i++) {
      mtx.addOutput({
        value: protocol.consensus.COIN,
        address: wallet.getChange()
      });
    }

    await wallet.fund(mtx, {
      selection: 'random'
    });

    const {paths, inputTXs, coins} =
      p2pkhSignatureInputs(mtx, wallet, path.clone());

    const signed = await manager.signTransaction(mtx, {
      paths,
      inputTXs,
      coins
    });

    // verify the transaction
    assert.ok(signed.verify());
  });
});
