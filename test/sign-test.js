/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {Network, MTX, TX, Coin} = require('bcoin');
const {Path, DeviceManager} = require('../lib/bsigner');
const {vendors} = require('../lib/common');
const {getLogger, getTestVendors} = require('./utils/common');

const logger = getLogger();
const enabledVendors = getTestVendors();

describe('Sign Transaction', function () {
  this.timeout(1e7);

  const signVectors = readSignVectors('./data/signVectors.json');
  const network = signVectors.network;

  // use hardware global so it
  // can be properly closed after
  // the tests
  let manager = null;

  before(async () => {
    await logger.open();

    manager = DeviceManager.fromOptions({
      vendor: enabledVendors,
      network,
      logger,
      [vendors.LEDGER]: {
        timeout: 0
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
    for (const signVector of signVectors.vectors) {
      it(`should sign ${signVector.description} (${vendor})`, async () => {
        await manager.selectDevice(vendor);

        const {tx, inputTXs, coins, inputData} = signVector;

        const signed = await manager.signTransaction(tx, {
          inputTXs,
          coins,
          inputData
        });

        assert.ok(signed.verify());
      });
    }
  }
});

function readSignVectors(path) {
  const json = require(path);

  json.network = Network.get(json.network);

  json.vectors = json.vectors.map((vector) => {
    vector.inputTXs = vector.inputTXs.map((itx) => {
      return TX.fromRaw(Buffer.from(itx, 'hex'));
    });

    vector.coins = vector.coins.map(c => Coin.fromJSON(c, json.network));

    vector.tx = MTX.fromRaw(Buffer.from(vector.tx, 'hex'));

    for (const coin of vector.coins)
      vector.tx.view.addCoin(coin);

    return vector;
  });

  return json;
}
