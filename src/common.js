/*!
 * common.js
 * Copyright (c) 2018-2019, bcoin developers (MIT License)
 * https://github.com/bcoin-org/bsigner
 */

'use strict';

const assert = require('bsert');
const blake2b = require('bcrypto/lib/blake2b');
const {BufferMap} = require('buffer-map');
const network = require('bcoin/lib/protocol/networks');

/*
 * vendors to act as backends
 * for the Hardware signer
 */
const vendors = {
  LEDGER: 'LEDGER',
  TREZOR: 'TREZOR',
  LOCAL: 'LOCAL',
  ANY: 'ANY'
};

const bip44 = {
  purpose: 44,
  coinType: {
    main: 0,
    testnet: 1,
    regtest: 1,
    simnet: 1
  },
  hardened: 0x80000000
};

// hardened can be
// represented as
// (1 << 31) >>> 0

/*
 * harden an index
 */
function harden(value) {
  if (typeof value === 'string') {
    const suffix = value[value.length-1];
    assert(suffix !== '\'' || suffix !== 'h');
    value = parseInt(value, 10);
  }
  return (value | bip44.hardened) >>> 0;
}

/*
 * convert the integer in the bcoin#network
 * object into a buffer based on the network
 */
function networkKey(type) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(network[type].keyPrefix.xpubkey);
  return buf;
}

// see satoshi labs slip 132 for reference
// https://github.com/satoshilabs/slips/blob/master/slip-0132.md
const HDVersionBytes = new BufferMap([
  // xpub: m'/44'/0'
  [networkKey('main'), [
    harden(bip44.purpose),
    harden(bip44.coinType.main)
  ]],
  // tpub: m'/44'/1'
  // 0x043587cf
  [networkKey('testnet'), [
    harden(bip44.purpose),
    harden(bip44.coinType.testnet)
  ]],
  // tpub: m'/44'/1'
  [networkKey('regtest'), [
    harden(bip44.purpose),
    harden(bip44.coinType.regtest)
  ]],
  // spub: m'/44'/1'
  [networkKey('simnet'), [
    harden(bip44.purpose),
    harden(bip44.coinType.simnet)
  ]]
]);

/*
 * parsePath, stolen from bcoin utils
 */
function parsePath(path, hard) {
  assert(typeof path === 'string');
  assert(typeof hard === 'boolean');
  assert(path.length >= 1);
  assert(path.length <= 3062);

  const parts = path.split('/');
  const root = parts[0];

  if (root !== 'm' && root !== 'M' && root !== 'm\'' && root !== 'M\'') {
    throw new Error('Invalid path root.');
  }

  const result = [];

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i];

    const last = part[part.length - 1];
    const hardened = last === '\'' || last === 'h';

    if (hardened)
      part = part.slice(0, -1);

    if (part.length > 10)
      throw new Error('Path index too large.');

    if (!/^\d+$/.test(part))
      throw new Error('Path index is non-numeric.');

    let index = parseInt(part, 10);

    if (index >>> 0 !== index)
      throw new Error('Path index out of range.');

    if (hardened) {
      index |= bip44.hardened;
      index >>>= 0;
    }

    if (!hard && index & bip44.hardened)
      throw new Error('Path index cannot be hardened.');

    result.push(index);
  }

  return result;
}

/*
 * simple hashing
 *
 * @param {Buffer|String} - preimage
 * @param {String} [enc='hex']
 * @returns {Buffer}
 */
function hash(preimage, enc = 'hex') {
  if (!Buffer.isBuffer(preimage))
    preimage = Buffer.from(preimage, enc);
  return blake2b.digest(preimage);
}

function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}

exports.bip44 = bip44;
exports.vendors = vendors;
exports.hash = hash;
exports.parsePath = parsePath;
exports.sleep = sleep;
exports.HDVersionBytes = HDVersionBytes;
exports.harden = harden;
