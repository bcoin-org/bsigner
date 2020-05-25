/*!
 * path.js
 * Copyright (c) 2018-2019, bcoin developers (MIT License)
 * https://github.com/bcoin-org/bsigner
 */

'use strict';

const {HDPublicKey} = require('bcoin');
const base58 = require('bcrypto/lib/encoding/base58');
const assert = require('bsert');
const {custom} = require('./internal/custom');

const {parsePath, bip44, HDVersionBytes, harden} = require('./common');

/*
 * Path class for handling bip44 paths
 *
 * - can dynamically set each of purpose,
 *   coin, account, branch and index
 * - strict mode prevents some improper usage
 * - understands ' and h syntax
 *
 */
class Path {
  constructor() {
    this.list = [];

    this.strict = true;
    this.mutable = true;

    this.network = null;

    this.depth = 0;
    this._purpose = null;
    this._coin = null;
    this._account = null;
    this._branch = null;
    this._index = null;
  }

  get purpose() {
    return this._purpose;
  }

  /*
   * update the class property
   * increment the depth if necessary
   * change the value in the list if necessary
   */

  set purpose(value) {
    if (value === null) {
      this._purpose = null;
      return;
    }

    if (typeof value === 'string')
      value = fromNumberLike(value);
    assert(0 <= value);

    this._purpose = value;
    if (this.depth === 0)
      this.depth = 1;

    this.list[0] = value;
  }

  get coin() {
    return this._coin;
  }

  set coin(value) {
    if (value === null) {
      this._coin = null;
      return;
    }

    if (typeof value === 'string')
      value = fromNumberLike(value);
    assert(0 <= value);

    if (this.depth === 1)
      this.depth = 2;

    this._coin = value;
    this.list[1] = value;
  }

  get account() {
    return this._account;
  }

  set account(value) {
    if (value === null) {
      this._account = null;
      return;
    }

    if (typeof value === 'string')
      value = fromNumberLike(value);
    assert(0 <= value);

    this._account = value;
    if (this.depth === 2)
      this.depth = 3;
    this.list[2] = value;
  }

  get branch() {
    return this._branch;
  }

  set branch(value) {
    if (value === null) {
      this._branch = null;
      return;
    }

    if (typeof value === 'string')
      value = fromNumberLike(value);
    assert(0 <= value);

    this._branch = value;
    if (this.depth === 3)
      this.depth = 4;
    this.list[3] = value;
  }

  get index() {
    return this._index;
  }

  set index(value) {
    if (value === null) {
      this._index = null;
      return;
    }

    if (typeof value === 'string')
      value = fromNumberLike(value);
    assert(0 <= value);

    this._index = value;
    if (this.depth === 4)
      this.depth = 5;
    this.list[4] = value;
  }

  /*
   * create a Path from a list of integers
   */
  fromList(path, hardened) {
    assert(Array.isArray(path));
    assert(path.length < 256);

    if (hardened)
      path = path.map(i => ((i | bip44.hardened) >>> 0));

    for (const [i, uint] of Object.entries(path)) {
      assert((uint >>> 0) === uint);

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
    const purpose = parseOption(options.purpose);
    const account = parseOption(options.account);

    // prioritize using the network
    // over passed in coin type
    // since that isn't a common usecase
    const coin = options.network ?
      Path.harden(bip44.coinType[options.network]) :
      parseOption(options.coin);

    if (options.network)
      this.network = options.network;

    const branch = parseOption(options.branch);
    const index = parseOption(options.index);

    if (options.strict)
      this.strict = options.strict;

    assert(purpose !== null);
    assert(account !== null);
    assert(coin !== null);

    // follow bip44 ordering
    const list = [
      purpose,
      coin,
      account
    ];

    // either add both or add neither
    if (branch !== null && index !== null) {
      list.push(branch);
      list.push(index);
    }

    return this.fromList(list);
  }

  clone() {
    return Path.fromOptions({
      purpose: this.purpose,
      coin: this.coin,
      network: this.network,
      account: this.account,
      branch: this.branch,
      index: this.index
    });
  }

  /*
   *
   * Warning: this knows nothing about the purpose
   * or coin type and will assume bip44 and bitcoin
   * mainnet
   */
  fromIndex(index, hardened = true) {
    const purpose = this.purpose !== null ?
      this.purpose :
      Path.harden(44);

    const coin = this.coin !== null ?
      this.coin :
      Path.harden(0);

    const account = hardened ?
      Path.harden(index) :
      index;

    return this.fromList([
      purpose,
      coin,
      account
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
    const str = ['m'];

    for (const [, uint] of Object.entries(this.list)) {
      assert((uint >>> 0) === uint);
      if ((uint & bip44.hardened) >>> 0)
        str.push((uint ^ bip44.hardened) + '\'');
      else
        str.push(uint);
    }

    return str.join('/');
  }

  [custom]() {
    return `<Path bip${this.purpose ^ bip44.hardened}=${this.toString()}>`;
  }

  fromType(type, hardened) {
    switch (typeof type) {
      case 'string':
        if (base58.test(type))
          return this.fromAccountPublicKey(type);
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
    return new this().fromOptions(options);
  }

  static fromAccountPublicKey(pubkey) {
    return new this().fromAccountPublicKey(pubkey);
  }

  fromAccountPublicKey(xkey) {
    if (typeof xkey === 'string')
      xkey = base58.decode(xkey);

    if (!Buffer.isBuffer(xkey))
      throw new Error('xkey must be buffer or a hex string.');

    const prefix = xkey.slice(0,4);
    const base = HDVersionBytes.get(prefix);

    assert(base, 'unknown exteneded key prefix');

    const hdpubkey = HDPublicKey.fromRaw(xkey);
    assert(hdpubkey.depth === 3);

    return this.fromList([
      ...base,
      hdpubkey.childIndex
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
      index = fromNumberLike(index);

    assert((index >>> 0) === index);

    if (hardened)
      index = Path.harden(index);

    return this.fromList([...this.list, index]);
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
    if (last === '\'' || last === 'h')
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
    if (last === '\'' || last === 'h') {
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
