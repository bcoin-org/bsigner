/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {Network} = require('bcoin');
const {Path, DeviceManager, vendors} = require('../lib/bsigner');
const {testxpub} = require('./utils/key');
const {getLogger} = require('./utils/common');

/*
 * these tests require the use of a common seed between
 * devices and locally
 *
 * the mnemonic abandon 11 times + about is used
 */

const network = Network.get('regtest');
const logger = getLogger();

/*
 * use the network to parse the coinType
 * allow for a dynamic accountIndex
 */
function getPath(accountIndex, network) {
  const coinType = network.keyPrefix.coinType;
  const path = Path.fromList([44, coinType, accountIndex], true);
  return path;
}

// use hardware global so it
// can be properly closed after
// the tests
let manager;

describe('Get Public Key', function () {
  this.timeout(1e7);

  before(async () => {
    await logger.open();
  });

  afterEach(async () => {
    if (manager.opened)
      await manager.close();
  });

  it('should get public key from ledger', async () => {
    manager = DeviceManager.fromOptions({
      vendor: vendors.LEDGER,
      logger,
      network
    });

    await manager.open();
    await manager.selectDevice(vendors.LEDGER);

    for (let i = 0; i <= 0; i++) {
      const accountIndex = i;
      const path = getPath(accountIndex, network);
      const pubkey = await manager.getPublicKey(path);

      const testpubkey = testxpub(accountIndex, network);

      /*
       * test all the values in the object
       * except for parentFingerPrint
       */
      for (const [key,value] of Object.entries(pubkey)) {
        // bledger currently doesn't return a parent fingerprint
        if (key === 'parentFingerPrint')
          continue;

        if (Buffer.isBuffer(value))
          assert.bufferEqual(value, testpubkey[key],
            'be sure to use the right mnemonic');
        else
          assert.deepEqual(value, testpubkey[key]);
      }

      const xpub = pubkey.xpubkey(network.type);
      const expected = testpubkey.xpubkey(network.type);
      assert.equal(xpub, expected);
    }
  });

  it.skip('should get public key from trezor', async () => {
    const accountIndex = 0;
    const path = getPath(accountIndex, network);

    manager = DeviceManager.fromOptions({
      vendor: 'trezor',
      network,
      logger
    });

    await manager.initialize();

    const pubkey = await manager.getPublicKey(path);
    const testpubkey = testxpub(accountIndex, network);

    for (const [key,value] of Object.entries(pubkey)) {
      if (Buffer.isBuffer(value))
        assert.bufferEqual(value, testpubkey[key]);
      else
        assert.deepEqual(value, testpubkey[key]);
    }

    const xpub = pubkey.xpubkey(network);
    const expected = testpubkey.xpubkey(network);
    assert.equal(xpub, expected);
  });
});
