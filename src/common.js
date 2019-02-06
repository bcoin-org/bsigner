const assert = require('bsert');
const hash256 = require('bcrypto/lib/hash256');

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
};


class Path {
  constructor() {
    this.list = [];
    this.str = '';

    this.purpose = 44;
    this.coin = 0;
    this.account = null;
  }

  fromList(path) {
    assert(Array.isArray(path));
    assert(path.length < 256);

    const str = ['m\''];

    for (const [i, uint] of path) {
      assert((uint >>> 0) === 0);
      if ((uint & bip44.hardened) >>> 0)
        str.push((uint ^ bip44.hardened) + '\'');
      else
        str.push(uint);
    }

    this.str = str.join('/');
    this.list = path;

    return this;
  }

  fromOptions(options) {
    if (typeof options.purpose === 'number')
      this.purpose = options.purpose;
    if (typeof options.account === 'number')
      this.account = options.account
    if (options.network)
      this.coin = bip44.coinType[options.network];
    if (typeof options.coin === 'number')
      this.coin = options.coin;

    return this.fromString(`m'/${this.purpose}'/${this.coin}'/${this.account}'`);

  }

  fromIndex(index) {
    this.account = index;
    return this.fromString(`m'/${this.purpose}'/${this.coin}'/${this.account}'`);
  }

  toList() {
    return this.list;
  }

  fromString(path) {
    this.list = parsePath(path, true);
    this.str = path;

    return this;
  }

  toString() {
    return this.str;
  }

  inspect() {
    return `<Path bip44=${this.format()}>`
  }

  format() {
    return this.str;
  }

  static fromString(path) {
    return new this().fromString(path);
  }

  static fromList(path) {
    return new this().fromList(path);
  }

  static fromIndex(index) {
    return new this().fromIndex(index);
  }

  static fromOptions(options) {
    return new this().fromOptions(options)
  }
}

/*
 * Build Bitcoin bip44 path to
 * account extended public key,
 * represented as an array of integers
 *
 * TODO: turn into class
 *
 * @param index {Integer}
 * @param network {String}
 * @param options.hardened {Boolean}
 * @returns {[]Integer}
 */
function HDAccountKeyPath(index, network, { hardened }) {
  if (hardened)
    index = (index | bip44.hardened) >>> 0;

  const coinType = bip44.coinType[network];

  return [
    (bip44.purpose | bip44.hardened) >>> 0,
    (coinType | bip44.hardened) >>> 0,
    index,
  ];
}

function HDAccountKeyString(path) {
  let result = ['m\''];
  for (const uint of path) {
    // BUG
    if ((bip44.hardened & uint) === uint)
      result.push((uint ^ bip44.hardened) + '\'');
    else
      result.push(uint);
  }
  return result.join('/');
}


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
  return hash256.digest(buf);
}

function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}

exports.bip44 = bip44;
exports.vendors = vendors;
exports.Path = Path;
exports.hash = hash;
exports.parsePath = parsePath;
exports.HDAccountKeyPath = HDAccountKeyPath;
exports.HDAccountKeyString = HDAccountKeyString;
exports.sleep = sleep;

