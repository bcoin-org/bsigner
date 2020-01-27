/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const {Network, MTX, TX, Coin} = require('bcoin');
const {DeviceManager} = require('../lib/bsigner');
const {vendors} = require('../lib/common');
const {getLogger, getTestVendors} = require('./utils/common');

const logger = getLogger();
const enabledVendors = getTestVendors();

describe('Sign Transaction', function () {
  this.timeout(1e7);

  const signVectors = readSignVectors('./data/signVectors.json');
  const network = signVectors.network;

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

        const {tx, inputData} = signVector;
        const signed = await manager.signTransaction(tx, inputData);

        signed.check();
      });
    }
  }
});

function readSignVectors(path) {
  const json = require(path);

  json.network = Network.get(json.network);

  json.vectors = json.vectors.map((vector) => {
    vector.tx = MTX.fromRaw(Buffer.from(vector.tx, 'hex'));
    vector.inputData = vector.inputData.map((data) => {
      const coin = Coin.fromJSON(data.coin, json.network);
      const prevTX = TX.fromRaw(Buffer.from(data.prevTX, 'hex'));
      const witness = Boolean(data.witness);
      const {multisig, path} = data;

      vector.tx.view.addCoin(coin);

      return {path, witness, multisig, coin, prevTX};
    });

    return vector;
  });

  return json;
}
