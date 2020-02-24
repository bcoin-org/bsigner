/*!
 * app.js
 * Copyright (c) 2018-2019, bcoin developers (MIT License)
 * https://github.com/bcoin-org/bsigner
 */

'use strict';

const {MTX, TX, Coin} = require('bcoin');
const assert = require('bsert');
const {hash} = require('./common');
const {Path} = require('./path');

/*
 * generate token for authentication usage
 * allows clients to use token derived from
 * their hardware device
 *
 * @param {bsigner#Hardware} - hardware
 * @param {bsigner#Path} - path
 * @param {String} - enc
 * @returns {Buffer|String}
 */
async function generateToken(hardware, path, enc) {
  if (!path)
    throw new Error('must provide a path');

  const hdpubkey = await hardware.getPublicKey(path);
  const token = hash(hdpubkey.publicKey);
  if (enc === 'hex')
    return token.toString('hex');
  return token;
}

/*
 * build data structures required for
 * signing with hardware device
 * attempts to guess paths to keys
 * if they are not passed
 *
 * @param {Object} options
 * @param {bcoin#MTX|Object} options.tx
 * @param {bclient#WalletClient#wallet} options.wallet
 * @param {[]bsigner#Path?} options.paths
 * @param {bsigner#Path?} options.path
 * @param {bcoin#Network|String} options.network
 * @param {Number|String} options.account
 * @returns {Object}
 */
async function prepareSign(options) {

  const {wallet} = options;
  let {tx, paths, path, network} = options;

  assert(tx, 'must pass tx');
  assert(wallet, 'must pass wallet client');
  assert(network, 'must pass network');

  // handle both bcoin#Network and string
  if (network.type)
    network = network.type;

  // must use fromJSON to build
  // the bcoin.CoinView
  if (!MTX.isMTX(tx))
    tx = MTX.fromJSON(tx);

  // if paths are not passed in
  // assume the same path for each
  // coin up to the account depth
  paths = await normalizePaths(tx, wallet, paths, path, options.account);
  assert(Array.isArray(paths));

  const inputData = [];

  for (const [i, input] of Object.entries(tx.inputs)) {
    const prevhash = input.prevout.txid();
    const prevTX = await wallet.getTX(prevhash);
    const inputTX = TX.fromRaw(prevTX.tx, 'hex');

    const coin = tx.view.getCoinFor(input);

    if (!coin)
      throw new Error('could not fetch coin');

    const base = paths[i].clone();
    const address = coin.getAddress().toString(network);
    const keyinfo = await wallet.getKey(address);

    if (!keyinfo)
      throw new Error('could not fetch key info');

    const {witness, branch, index} = keyinfo;

    const data = {
      coin: coin,
      prevTX: inputTX,
      path: base.push(branch).push(index),
      witness: witness
    };

    inputData.push(data);
  }

  return {
    mtx: tx,
    inputData: inputData
  };
}

/**
 * Build InputDatas required for multisig signing.
 * @param {Object} options
 * @param {bmultisig#WalletClient#wallet} options.wallet
 * @param {Number} options.pid - proposal ID
 * @param {Path} options.path - used for all inputs
 * @param {Network} options.network
 */

async function prepareSignMultisig(options) {
  const {wallet} = options;
  let {path, pid, network} = options;

  assert(wallet, 'must pass wallet client');
  assert(network, 'must pass network');

  // handle both bcoin#Network and string
  if (network.type)
    network = network.type;

  const account = await wallet.getAccount();
  const witness = account.witness;
  const xpubs = [account.accountKey, ...account.keys];

  const pmtx = await wallet.getProposalMTX(pid, {
    paths: true,
    txs: true
  });

  const mtx = MTX.fromJSON(pmtx.tx);

  const paths = await normalizePaths(mtx, wallet, null, path);
  assert(Array.isArray(paths));

  const inputData = [];
  for (const [i, input] of mtx.inputs.entries()) {
    if (!pmtx.paths[i]) {
      // TODO: Update after external inputs are supported
      // or we have feature detection.
      throw new Error('External inputs are not supported.');
    }

    const {branch, index} = pmtx.paths[i];
    const multisig = {
      m: account.m,
      pubkeys: []
    };

    for (const xpub of xpubs) {
      multisig.pubkeys.push({
        xpub: xpub,
        path: [branch, index],
        signature: ''
      });
    }

    const data = {
      witness: witness,
      prevout: input.prevout,
      coin: input.coin,
      prevTX: TX.fromRaw(Buffer.from(pmtx.txs[i], 'hex')),
      path: path.clone().push(branch).push(index),
      multisig: multisig
    };

    inputData.push(data);
  }

  return {mtx, inputData};
}

/*
 * attempt to guess the path by brute forcing
 * public key derivation paths
 * this will fail if multiple cosigners are on the same device
 * because it greedily stops at the first match
 * its possible to make it smarter by searching bip48/84 as well
 *
 * @param {bsigner#Hardware}
 * @param {bclient#WalletClient#wallet}
 * @param {bcoin#Network|String}
 * @returns {bsigner#Path}
 */
async function guessPath(hardware, wallet, network) {
  let target;

  assert(hardware, 'must pass hardware');
  assert(wallet, 'must pass wallet');
  const info = await wallet.getAccount();
  if (!info)
    throw new Error('could not fetch account info');

  // create a set of the keys
  const keys = new Set([info.accountKey, ...info.keys]);

  // iterate over the keys and parse a path
  // from each of them, get the key at that
  // path from the local device and then
  // check the equality to determine the path to use
  for (const key of keys.values()) {
    const path = Path.fromAccountPublicKey(key);
    const xkey = await hardware.getPublicKey(path);
    if (keys.has(xkey.xpubkey(network))) {
      target = key;
      break;
    }
  }

  if (target)
    return Path.fromAccountPublicKey(target);

  return target;
}

/*
 * builds a list of known keys and
 * creates a mapping of key -> path
 * if the key is unknown, the path
 * will be null
 *
 * @param {bsigner#Hardware}
 * @param {bclient#WalletClient#wallet}
 * @returns {Object}
 */
async function getKnownPaths(hardware, wallet) {
  const out = {
    keys: [],
    paths: {}
  };

  assert(hardware, 'must pass hardware');
  assert(wallet, 'must pass wallet');
  const info = await wallet.getAccount();
  if (!info)
    throw new Error('could not fetch account info');

  const keys = new Set([info.accountKey, ...info.keys]);

  for (const key of keys.values()) {
    // set the initial value to null
    out.paths[key] = null;
    for (const purpose of [44, 48]) {
      const path = Path.fromAccountPublicKey(key);
      path.purpose = Path.harden(purpose);

      const xkey = await hardware.getXPUB(path);

      if (keys.has(xkey)) {
        out.keys.push(xkey);
        out.paths[xkey] = path.toString();
      }
    }
  }

  return out;
}

async function normalizePaths(tx, wallet, paths, path, account) {
  if (paths)
    return paths;

  if (!path) {
    if (!account)
      throw new Error('Can not get account info without account.');

    const accountInfo = await wallet.getAccount(account);

    if (!accountInfo)
      throw new Error('Problem fetching account info.');

    path = Path.fromAccountPublicKey(accountInfo.accountKey);
  }

  if (!Path.isPath(path))
    path = Path.fromType(path);

  // account level path
  assert(path.depth === 3);
  paths = tx.inputs.map(() => path);

  return paths;
}

exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;
exports.guessPath = guessPath;
exports.getKnownPaths = getKnownPaths;
