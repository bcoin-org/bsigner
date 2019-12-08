'use strict';

const path = require('path');
const assert = require('bsert');
const Logger = require('blgr');
const {HDPublicKey,KeyRing} = require('bcoin');
const {tmpdir} = require('os');
const {randomBytes} = require('bcrypto/lib/random');

function getLogger() {
  const level = process.env.TEST_LOGLEVEL ? process.env.TEST_LOGLEVEL : 'none';

  return new Logger(level);
}

/*
 * @param {options}
 * @param {options.hdPublicKey}
 */
function deriveFromAccountHDPublicKey(options) {
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
}

/*
 * build the inputs to ledgerApp
 * this also works with p2wpkh as well
 */
function p2pkhSignatureInputs(mtx, wallet, accountPath) {
  const inputTXs = [];
  const coins = [];
  const paths = [];

  for (const input of mtx.inputs) {
    const prevhash = input.prevout.hash;
    const tx = wallet.getTX(prevhash);
    inputTXs.push(tx);

    const coin = mtx.view.getCoinFor(input);
    coins.push(coin);

    const base = accountPath.clone();
    const hash = input.getHash(coin);
    const { branch, index } = wallet.getPath(hash);
    paths.push(base.push(branch).push(index));
  }

  return {
    inputTXs,
    coins,
    paths
  };
}

function testdir(name) {
  assert(/^[a-z]+$/.test(name), 'Invalid name');

  const uniq = randomBytes(4).toString('hex');
  return path.join(tmpdir(), `bcoin-test-${name}-${uniq}`);
};

exports.deriveFromAccountHDPublicKey = deriveFromAccountHDPublicKey;
exports.p2pkhSignatureInputs = p2pkhSignatureInputs;
exports.testdir = testdir;
exports.getLogger = getLogger;
