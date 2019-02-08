const {parsePath,bip44,HDVersionBytes} = require('./common');
const assert = require('bsert');
const {base58} = require('bstring');
const {HDPublicKey} = require('bcoin');
const inspect = Symbol.for('nodejs.util.inspect.custom');

/*
 * TODO: bugs around setting
 * purpose, coin and account
 */
class Path {
  constructor() {
    this.list = [];
    this.str = '';
    this.mutable = true;

    this.depth = 0;

    this.purpose = 44;
    this.coin = 0;
    this.account = null;
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

    for (const uint of path) {
      assert((uint >>> 0) === uint);
      if ((uint & bip44.hardened) >>> 0) {
        str.push((uint ^ bip44.hardened) + '\'');
      }
      else
        str.push(uint);
    }

    this.str = str.join('/');
    this.list = path.slice();

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

    let str = `m'/${this.purpose}'/${this.coin}'/${this.account}'`;

    if (typeof options.branch === 'number')
      str += `/${options.branch}`;
    if (typeof options.index === 'number')
      str += `/${options.index}`;

    return this.fromString(str);

  }

  /*
   *
   * Warning: this knows nothing about the purpose
   * or coin type and will assume bip44 and bitcoin
   * mainnet
   */
  fromIndex(index, hardened = true) {
    let str = `m'/${this.purpose}'/${this.coin}'/`;

    if (hardened) {
      this.account = (index | bip44.hardened) >>> 0;
      str += `${index}'`
    }
    else {
      this.account = index;
      str += `${index}`
    }

    return this.fromString(str);
  }

  toList() {
    return this.list;
  }

  fromString(path) {
    this.list = parsePath(path, true);
    this.str = path.slice();

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

  toString() {
    return this.str;
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

  static parsePrefix() {

  }

  fromAccountPublicKey(xkey) {
    if (typeof xkey === 'string')
      xkey = base58.decode(xkey);

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

    return this;
  }

  static isPath(obj) {
    return obj instanceof Path;
  }
}

exports.Path = Path;
