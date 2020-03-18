/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {Network} = require('bcoin');
const {Path, Signer} = require('../lib/bsigner');
const {vendors} = require('../lib/common');
const {testxpub} = require('./utils/key');
const {getLogger, getTestVendors} = require('./utils/common');
const {phrase} = require('./utils/key');

const network = Network.get('regtest');
const logger = getLogger();
const enabledVendors = getTestVendors();

describe('Get Public Key', function () {
  this.timeout(1e7);

  // use hardware global so it
  // can be properly closed after
  // the tests
  let manager = null;

  before(async () => {
    await logger.open();

    manager = Signer.fromOptions({
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
  });

  after(async () => {
    if (manager.opened)
      await manager.close();
  });

  for (const vendor of enabledVendors) {
    it(`should get public key from ${vendor}`, async function() {
      const device = await manager.selectDevice(vendor);
      await device.open();

      for (let i = 0; i <= 0; i++) {
        const accountIndex = i;
        const path = getPath(accountIndex, network);
        const pubkey = await manager.getPublicKey(path);

        const testpubkey = testxpub(accountIndex, network);

        // test all the values in the object
        // except for parentFingerPrint
        for (const [key, value] of Object.entries(pubkey)) {
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

      await device.close();
    });
  }
});

/*
 * use the network to parse the coinType
 * allow for a dynamic accountIndex
 */
function getPath(accountIndex, network) {
  const coinType = network.keyPrefix.coinType;
  const path = Path.fromList([44, coinType, accountIndex], true);
  return path;
}
