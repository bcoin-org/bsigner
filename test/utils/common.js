'use strict';

const path = require('path');
const assert = require('bsert');
const Logger = require('blgr');
const {HDPublicKey, KeyRing, Address} = require('bcoin');
const {tmpdir} = require('os');
const {randomBytes} = require('bcrypto/lib/random');
const {parseVendors} = require('../../lib/common');

const common = exports;

common.getLogger = function getLogger() {
  const level = process.env.TEST_LOGLEVEL ? process.env.TEST_LOGLEVEL : 'none';

  return new Logger(level);
};

common.getTestVendors = function getTestVendors() {
  let testVendors = process.env.TEST_VENDOR ? process.env.TEST_VENDOR : 'any';

  testVendors = testVendors.toUpperCase();

  if (testVendors === 'ANY')
    return parseVendors(testVendors);

  const enabledVendors = testVendors.split(',');

  return parseVendors(enabledVendors);
};

/*
 * @param {options}
 * @param {options.hdPublicKey}
 */
common.deriveFromAccountHDPublicKey = function deriveFromAccountHDPublicKey(options) {
  // format base58 encoded extended public key
  // network is required for prefix
  const {hdPublicKey,network} = options;
  assert(HDPublicKey.isHDPublicKey(hdPublicKey));
  assert(typeof network === 'string');
  // const xpub = hdPublicKey.xpubkey(network);

  // derive receive address
  const {index = 0} = options;

  const result = {};
  const witness = options.witness ? true : false;

  {
    const hd = hdPublicKey.derive(1).derive(index);
    const keyring = KeyRing.fromPublic(hd.publicKey);
    keyring.witness = witness;
    const addr = keyring.getAddress('string', network);
    result.change = {
      keyring: keyring,
      address: addr,
      hdPublicKey: hd
    };
  }

  {
    assert(typeof index === 'number');
    const hd = hdPublicKey.derive(0).derive(index);
    const keyring = KeyRing.fromPublic(hd.publicKey);
    keyring.witness = witness;
    const addr = keyring.getAddress('string', network);
    result.receive = {
      keyring: keyring,
      address: addr,
      hdPublicKey: hd
    };
  }

  return result;
};

/*
 * build the inputs to ledgerApp
 * this also works with p2wpkh as well
 * NOTE: Does not work for nested p2wpkh.
 */
common.p2pkhSignatureInputs = function p2pkhSignatureInputs(mtx, wallet, accountPath) {
  const inputData = [];

  for (const input of mtx.inputs) {
    const data = {};

    const prevhash = input.prevout.hash;
    const tx = wallet.getTX(prevhash);
    const coin = mtx.view.getCoinFor(input);

    const address = coin.getAddress();
    const {branch, index} = wallet.getPath(address.getHash());
    const base = accountPath.clone();

    data.prevTX = tx;
    data.coin = coin;
    data.path = base.push(branch).push(index);
    data.witness = address.type === Address.types.WITNESS;

    inputData.push(data);
  }

  return inputData;
};

common.testdir = function testdir(name) {
  assert(/^[a-z]+$/.test(name), 'Invalid name');

  const uniq = randomBytes(4).toString('hex');
  return path.join(tmpdir(), `bcoin-test-${name}-${uniq}`);
};
