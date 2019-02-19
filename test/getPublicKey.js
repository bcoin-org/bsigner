const assert = require('bsert');
const blgr = require('blgr');
const {Network} = require('bcoin');
const {Path,Hardware} = require('../lib/libsigner');
const {phrase,testxpub} = require('./utils/key');

/*
 * these tests require the use of a common seed between
 * a ledger and a trezor
 */

const network = Network.get('regtest');
const logger = new blgr('debug');

/*
 * use the network to parse the coinType
 * allow for a dynamic accountIndex
 */
function getPath(accountIndex, network) {
  const coinType = network.keyPrefix.coinType;
  const path = Path.fromList([44,coinType,accountIndex], true);
  return path;
}

describe('Get Public Key', function () {
  this.timeout(1e7);

  before(async () => {
    await logger.open();
  });

  it('should get public key from ledger', async ($) => {

    const hardware = Hardware.fromOptions({
      vendor: 'ledger',
      network,
      logger,
    });

    await hardware.initialize();


    for (let i = 0; i <= 0; i++) {
      const accountIndex = i;
      const path = getPath(accountIndex, network);
      const pubkey = await hardware.getPublicKey(path);

      const testpubkey = testxpub(accountIndex, network);

      /*
       * test all the values in the object
       * except for parentFingerPrint
       */
      for (let [key,value] of Object.entries(pubkey)) {
        // bledger currently doesn't return a parent fingerprint
        if (key === 'parentFingerPrint')
          continue;

        if (Buffer.isBuffer(value))
          assert.bufferEqual(value, testpubkey[key]);
        else
          assert.deepEqual(value, testpubkey[key]);
      }

      /*
       * TODO: need fix to export parentFingerPrint
      const xpub = pubkey.xpubkey(network.type);
      const expected = testpubkey.xpubkey(network.type);
      assert.equal(xpub, expected);
      */
    }
  });

  it('should get public key from trezor', async ($) => {
    //$.skip();
    const accountIndex = 0;
    const path = getPath(accountIndex, network);

    const hardware = Hardware.fromOptions({
      vendor: 'trezor',
      network,
      logger,
    });

    await hardware.initialize();

    const pubkey = await hardware.getPublicKey(path);
    const testpubkey = testxpub(accountIndex, network);

    for (let [key,value] of Object.entries(pubkey)) {
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
