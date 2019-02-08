const assert = require('bsert');
const blake2b = require('bcrypto/lib/blake2b');
const {BufferMap} = require('buffer-map');

// TODO: turn into proxy
// with getting asserting
// valid get on coinType
const bip44 = {
  purpose: 44,
  coinType: {
    main: 0,
    testnet: 1,
    regtest: 1,
    simnet: 1,
  },
  hardened: 0x80000000,
};

const vendors = {
  LEDGER: 'ledger',
  TREZOR: 'trezor',
  LOCAL: 'local',
};

const prepareTypes = {
  STANDARD: 'standard',
  MULTISIG: 'multisig',
};

// see satoshi labs slip 132 for reference
// https://github.com/satoshilabs/slips/blob/master/slip-0132.md
const HDVersionBytes = new BufferMap([
  // xpub: m'/44'/0'
  [Buffer.from('0488b21e', 'hex'), [
    (bip44.purpose | bip44.hardened) >>> 0,
    (bip44.coinType.main | bip44.hardened) >>> 0,
  ]],
  // tpub: m'/44'/1'
  [Buffer.from('043587cf', 'hex'), [
    (bip44.purpose | bip44.hardened) >>> 0,
    (bip44.coinType.testnet | bip44.hardened) >>> 0,
  ]],
  // rpub: m'/44'/1'
  [Buffer.from('eab4fa05', 'hex'), [
    (bip44.purpose | bip44.hardened) >>> 0,
    (bip44.coinType.regtest | bip44.hardened) >>> 0,
  ]],
  // spub: m'/44'/1'
  [Buffer.from('0420bd3a', 'hex'), [
    (bip44.purpose | bip44.hardened) >>> 0,
    (bip44.coinType.simnet | bip44.hardened) >>> 0,
  ]],
]);

/*
 *
 */
function parsePath(path, hard) {
  assert(typeof path === 'string');
  assert(typeof hard === 'boolean');
  assert(path.length >= 1);
  assert(path.length <= 3062);

  const parts = path.split('/');
  const root = parts[0];

  if (root !== 'm' && root !== 'M' && root !== "m'" && root !== "M'") {
    throw new Error('Invalid path root.');
  }

  const result = [];

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i];

    const hardened = part[part.length - 1] === "'";

    if (hardened) part = part.slice(0, -1);

    if (part.length > 10) throw new Error('Path index too large.');

    if (!/^\d+$/.test(part)) throw new Error('Path index is non-numeric.');

    let index = parseInt(part, 10);

    if (index >>> 0 !== index) throw new Error('Path index out of range.');

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

function hash(buf) {
  return blake2b.digest(buf);
}

function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}

exports.bip44 = bip44;
exports.vendors = vendors;
exports.prepareTypes = prepareTypes;
exports.hash = hash;
exports.parsePath = parsePath;
exports.sleep = sleep;
exports.HDVersionBytes = HDVersionBytes;

