const {HDPublicKey} = require('bcoin');
const {base58} = require('bstring');
const assert = require('bsert');
const inspect = Symbol.for('nodejs.util.inspect.custom');

const {parsePath,bip44,HDVersionBytes,harden} = require('./common');

/*
 * Path class for handling bip44 paths
 *
 */
class Path {
  constructor() {
    this.list = [];
    this.str = 'm';

    this.strict = true;
    this.mutable = true;

    this.depth = 0;

    this.purpose = null;
    this.coin = null;
    this.account = null;
    this.network = null;

    this.branch = null;
    this.index = null;
  }

  /*
   *
   */
  fromList(path, hardened) {
    assert(Array.isArray(path));
    assert(path.length < 256);

    if (hardened)
      path = path.map(i => ((i | bip44.hardened) >>> 0));

    const str = ['m\''];

    for (const [i, uint] of Object.entries(path)) {
      assert((uint >>> 0) === uint);
      if ((uint & bip44.hardened) >>> 0)
        str.push((uint ^ bip44.hardened) + '\'');
      else
        str.push(uint);

      switch (i) {
        case '0':
          this.purpose = uint;
          break;
        case '1':
          this.coin = uint;
          break;
        case '2':
          this.account = uint;
          break;
        case '3':
          this.branch = uint;
          break;
        case '4':
          this.index = uint;
          break;
      }
    }

    this.str = str.join('/');
    this.list = path.slice();
    this.depth = this.list.length;

    // freeze the Path when strict mode
    // is on to prevent further mutation
    if (this.strict && this.depth === 5) {
      this.freeze();
    }

    return this;
  }

  /*
   *
   * note: this doesn't harden by default
   */
  fromOptions(options) {
    this.purpose = parseOption(options.purpose);
    this.account = parseOption(options.account);

    // prioritize using the network
    // over passed in coin type
    // since that isn't a common usecase
    if (options.network) {
      const coin = bip44.coinType[options.network];
      // the spec hardens the coin type
      this.coin = Path.harden(coin);
      this.network = options.network;
    } else
      this.coin = parseOption(options.coin);

    this.branch = parseOption(options.branch);
    this.index = parseOption(options.index);

    if (options.strict)
      this.strict = options.strict;

    assert(this.purpose !== null);
    assert(this.account !== null);
    assert(this.coin !== null);

    // follow bip44 ordering
    const list = [
      this.purpose,
      this.coin,
      this.account,
    ];

    // either add both or add neither
    if (this.branch !== null && this.index !== null) {
      list.push(this.branch);
      list.push(this.index);
    }

    return this.fromList(list);
  }

  clone() {
    const child = new this.constructor();
    return child.fromOptions({
      purpose: this.purpose,
      coin: this.coin,
      network: this.network,
      account: this.account,
      branch: this.branch,
      index: this.index,
    });
  }

  /*
   *
   * Warning: this knows nothing about the purpose
   * or coin type and will assume bip44 and bitcoin
   * mainnet
   */
  fromIndex(index, hardened = true) {
    if (!this.purpose)
      this.purpose = Path.harden(44);
    if (!this.coin)
      this.coin = Path.harden(0);

    if (hardened)
      this.account = Path.harden(index);
    else
      this.account = index;

    return this.fromList([
      this.purpose,
      this.coin,
      this.account,
    ]);
  }

  toList() {
    return this.list;
  }

  fromString(path) {
    const list = parsePath(path, true);
    this.fromList(list);

    return this;
  }

  toString() {
    return this.str;
  }

  [inspect]() {
    return `<Path bip${this.purpose}=${this.toString()}>`
  }

  fromType(type, hardened) {
    switch (typeof type) {
      case 'string':
        if (base58.test(type))
          return this.fromAccountPublicKey(type)
        else
          return this.fromString(type);
      case 'object':
        if (Array.isArray(type))
          return this.fromList(type, hardened);
        // fallthrough
      default:
        throw new Error('bad type');
    }
  }

  static fromType(path, hardened) {
    return new this().fromType(path, hardened);
  }

  static fromString(path) {
    return new this().fromString(path);
  }

  static fromList(path, hardened) {
    return new this().fromList(path, hardened);
  }

  static fromIndex(index, hardened) {
    return new this().fromIndex(index, hardened);
  }

  static fromOptions(options) {
    return new this().fromOptions(options)
  }

  static fromAccountPublicKey(pubkey) {
    return new this().fromAccountPublicKey(pubkey)

  }

  fromAccountPublicKey(xkey) {
    if (typeof xkey === 'string')
      xkey = base58.decode(xkey);
    if (HDPublicKey.isHDPublicKey(xkey))
      throw new Error('cannot infer from HDPublicKey');

    const prefix = xkey.slice(0,4);
    const base = HDVersionBytes.get(prefix)

    assert(base, 'unknown exteneded key prefix');

    const hdpubkey = HDPublicKey.fromRaw(xkey);
    assert(hdpubkey.depth === 3);

    return this.fromList([
      ...base,
      hdpubkey.childIndex,
    ]);
  }

  /*
   * make the path object immutable
   */
  freeze() {
    this.mutable = false;
    Object.freeze(this);
    return this;
  }

  isMutable() {
    return this.mutable;
  }

  /*
   * @param {Integer} index
   * @param {Boolean} hardened
   */
  push(index, hardened) {
    if (!this.mutable)
      throw new Error('cannot mutate finalized path');

    if (typeof index === 'string')
      index = parseInt(index, 10);
    assert((index >>> 0) === index);

    if (hardened) {
      // append hardened string
      this.str += `/${index}'`;
      // harden the index
      index |= bip44.hardened;
      index >>>= 0;
    } else
      this.str += `/${index}`;

    this.list.push(index);
    this.depth += 1;

    return this;
  }

  static harden(value) {
    return harden(value);
  }

  static isPath(obj) {
    return obj instanceof Path;
  }
}

// helper functions for parsing fromOptions
function isOption(option) {
  if (option === null)
    return false;
  if (typeof option === 'object' && typeof option.index === 'number')
    return true;
  return false;
}
function fromOption(option) {
  assert(typeof option.index === 'number');
  if (option.hardened) {
    return Path.harden(option.index);
  }
  return option.index;
}
function isNumberLike(option) {
  if (typeof option === 'number')
    return true;
  if (typeof option === 'string') {
    // support for both ' and h suffix
    const last = option[option.length-1];
    if (last === `'` || last === 'h')
      option = option.slice(0,option.length-1);
    if (!Number.isNaN(parseInt(option, 10)))
      return true;
  }
  return false;
}
function fromNumberLike(option) {
  if (typeof option === 'number')
    return option;
  if (typeof option === 'string') {
    const last = option[option.length-1];
    if (last === `'` || last === 'h') {
      let index = option.slice(0,option.length-1);
      index = parseInt(index, 10);
      return Path.harden(index);
    }
    return parseInt(option, 10);
  }
  throw new Error('unexpected type');
}
function parseOption(option) {
  if (isNumberLike(option))
    return fromNumberLike(option);
  if (isOption(option))
    return fromOption(option);
  return null;
}

exports.Path = Path;
