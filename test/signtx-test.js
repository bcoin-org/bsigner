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
  blockstore,
  Network
} = require('bcoin');

const {Path, DeviceManager, vendors} = require('../lib/bsigner');
const MemWallet = require('./utils/memwallet');
const {
  getLogger,
  getTestVendors,
  p2pkhSignatureInputs,
  testdir
} = require('./utils/common');
const {testxpub, phrase} = require('./utils/key');

/*
 * test signing
 * NOTE: ledger firmware doesn't fully sign
 * the transaction if there are both segwit and
 * legacy inputs in the same transaction
 *
 * TODO: trezor testing
 */

const network = Network.get('regtest');
const logger = getLogger();
const enabledVendors = getTestVendors();

// MemWallet instance globals
// with and without segwit
let wallet;
let witwallet;

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
  workers,
  network
});

/*
 * create a miner to create blocks
 * and new utxos
 */
const miner = new Miner({
  chain,
  version: 4,
  workers,
  network
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

  let manager = null;

  // start up a chain and mine some blocks
  // to an address from Signer
  before(async () => {
    await logger.open();
    await workers.open();
    await blocks.open();
    await chain.open();
    await mempool.open();

    manager = DeviceManager.fromOptions({
      vendor: enabledVendors,
      network,
      logger,
      [vendors.LEDGER]: {
        timeout: 0
      },
      [vendors.MEMORY]: {
        // configure default device of memory device manager.
        device: { phrase }
      }
    });

    await manager.open();

    for (const vendor of enabledVendors) {
      try {
        await manager.selectDevice(vendor);
      } catch (e) {
        throw new Error(`Could not select device for ${vendor}.`);
      }
    }

    /*
     * NOTE: assignment to a global
     * get xpub and bcoin.HDPublicKey
     * for p2pkh, p2wpkh
     */
    {
      // standard p2pkh transactions
      const hdpubkey = testxpub(path.account, network);
      const xpub = hdpubkey.xpubkey(network);
      keys.standard.xpub = xpub;
      keys.standard.hdpubkey = hdpubkey;
    }
    {
      // standard p2wpkh transactions
      const hdpubkey = testxpub(witpath.account, network);
      const xpub = hdpubkey.xpubkey(network);
      keys.witness.xpub = xpub;
      keys.witness.hdpubkey = hdpubkey;
    }

    /*
     * NOTE: assignment to a global
     * create a standard wallet to fund
     * transactions
     */
    wallet = getWallet(keys.standard.xpub, false);

    /*
     * NOTE: assignment to a global
     * create a segwit wallet to
     * fund transactions
     */
    witwallet = getWallet(keys.witness.xpub, true);
  });

  // be sure to close the hardware after the tests
  after(async () => {
    await manager.close();
    await mempool.close();
    await chain.close();
    await blocks.close();
    await workers.close();
    await logger.close();
  });

  for (const vendor of enabledVendors) {
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

    it(`should select device ${vendor}`, async () => {
      const device = await manager.selectDevice(vendor);
      await device.open();
    });

    it(`should sign tx with 1 input (${vendor})`, async () => {
      const mtx = new MTX();
      mtx.addOutput({
        value: protocol.consensus.COIN,
        address: wallet.getChange()
      });

      await wallet.fund(mtx, {
        selection: 'random'
      });

      const inputData = p2pkhSignatureInputs(mtx, wallet, path.clone());
      const signed = await manager.signTransaction(mtx, inputData);

      // verify the transaction
      assert.ok(signed.verify());
    });

    /*
     * note that this test uses the witwallet
     */
    it(`should sign a tx with segwit inputs (${vendor})`, async () => {
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

      const inputData = p2pkhSignatureInputs(mtx, witwallet, witpath.clone());
      const signed = await manager.signTransaction(mtx, inputData);

      // verify the transaction
      assert.ok(signed.verify());
    });

    /*
     * the goal is to make sure that inputs
     * from different paths work
     * note that this test uses the wallet
     */
    it(`should sign tx with many inputs (${vendor})`, async () => {
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

      const inputData = p2pkhSignatureInputs(mtx, wallet, path.clone());
      const signed = await manager.signTransaction(mtx, inputData);

      // verify the transaction
      assert.ok(signed.verify());
    });

    it('should reset the chain', async () => {
      await chain.reset(0);
      await mempool.reset(0);

      wallet = getWallet(keys.standard.xpub, false);
      witwallet = getWallet(keys.witness.xpub, true);
    });
  }
});

function getWallet(xpub, witness) {
  return new MemWallet({
    network,
    xpub,
    witness,
    watchOnly: true,
    receiveDepth: 5
  });
}
