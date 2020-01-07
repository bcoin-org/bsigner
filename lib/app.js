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
 * @param {Object} - options
 * @param {bcoin#MTX|Object} - options.mtx
 * @param {bclient#WalletClient#wallet} - options.wallet
 * @param {[]bsigner#Path?} - options.paths
 * @param {bsigner#Path?} - options.path
 * @param {bcoin#Network|String} - options.network
 * @returns {Object}
 */
async function prepareSign(options) {
  const out = {
    paths: [],
    inputTXs: [],
    coins: [],
    scripts: []
  };

  const {wallet} = options;
  let {tx,paths,path,network} = options;

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
  if (!paths) {
    if (!path) {
      // if path not passed, try to assume path
      assert(options.account, 'must pass account');
      const accountInfo = await wallet.getAccount(options.account);
      if (!accountInfo)
        throw new Error('problem fetching account info');
      path = Path.fromAccountPublicKey(accountInfo.accountKey);
    }
    if (!Path.isPath(path))
      path = Path.fromType(path);

    // account level path
    assert(path.depth === 3);
    paths = tx.inputs.map(() => path.clone());
  }

  assert(Array.isArray(paths));

  for (const [i, input] of Object.entries(tx.inputs)) {
    const prevhash = input.prevout.txid();
    const prevTX = await wallet.getTX(prevhash);
    const inputTX = TX.fromRaw(prevTX.tx, 'hex');
    out.inputTXs.push(inputTX);

    const coin = tx.view.getCoinFor(input);
    if (!coin)
      throw new Error('could not fetch coin');
    out.coins.push(coin);

    let base = paths[i];
    const address = coin.getAddress().toString(network);
    const keyinfo = await wallet.getKey(address);
    if (!keyinfo)
      throw new Error('could not fetch key info');
    const {branch,index} = keyinfo;
    base = base.push(branch).push(index);

    out.paths.push(base);
  }

  return {
    mtx: tx,
    ...out
  };
}

/*
 * build data structures required
 * for multisig signing
 *
 * @param {Object} - options
 * @param {bmultisig#pmtx} - options.pmtx
 *   result of GET proposal mtx
 * @param {Object} - options.pmtx.tx
 * @param {[]Object} - options.pmtx.paths
 * @param {Number} - options.pmtx.paths.branch
 * @param {Number} - options.pmtx.paths.index
 * @param {[]Buffer} - options.scripts
 * @param {bsigner#Path} - options.path
 * @returns {Object}
 */
async function prepareSignMultisig(options) {
  const {pmtx, path} = options;

  assert(pmtx.tx, 'must pass tx');
  assert(pmtx.paths, 'must pass paths');
  assert(pmtx.scripts, 'must pass scripts');
  assert(pmtx.txs, 'must pass txs');

  const out = {
    paths: [],
    inputTXs: [],
    coins: [],
    scripts: []
  };

  assert(Path.isPath(path), 'must pass Path instance');

  const mtx = MTX.fromJSON(pmtx.tx);

  for (const [i, input] of Object.entries(pmtx.tx.inputs)) {
    // handle path
    const {branch,index} = pmtx.paths[i];
    const keypath = path.clone().push(branch).push(index);
    out.paths.push(keypath);

    // build input tx
    out.inputTXs.push(MTX.fromRaw(pmtx.txs[i], 'hex'));

    // handle script
    out.scripts.push(pmtx.scripts[i]);

    // handle coin
    const coin = Coin.fromJSON(input.coin);
    out.coins.push(coin);
  }

  return {
    mtx,
    ...out
  };
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

exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;
exports.guessPath = guessPath;
exports.getKnownPaths = getKnownPaths;
