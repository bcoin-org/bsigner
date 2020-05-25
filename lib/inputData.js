/*!
 * inputData.js - Input option for signing.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {enforce} = assert;
const {Struct} = require('bufio');
const consensus = require('bcoin/lib/protocol/consensus');
const Outpoint = require('bcoin/lib/primitives/outpoint');
const Coin = require('bcoin/lib/primitives/coin');
const Output = require('bcoin/lib/primitives/output');
const TX = require('bcoin/lib/primitives/tx');
const {Path} = require('./path');

/**
 * Input metadata for signing.
 * @property {Boolean} witness
 * @property {Outpoint} prevout
 * @property {TX?} prevTX
 * @property {Output|Coin} output
 * @property {Path} path
 * @property {Object} multisig
 */

class InputData extends Struct {
  constructor(options) {
    super();

    this.path = new Path();
    this.witness = false;
    this.prevout = new Outpoint();
    this.prevTX = null;
    this.output = new Output();
    this.multisig = null;

    this._coin = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Initialize InputData from options.
   * @param {Object} options
   * @returns {InputData}
   */

  fromOptions(options) {
    enforce(options, 'options', 'object');
    // for external inputs, we may have to remove this requirement.
    assert(options.path, 'options.path is required.');
    assert(options.prevout != null || options.coin != null,
       'options.prevout or options.coin is required.');
    assert(options.output != null || options.coin != null || options.prevTX,
      'options.output, options.coin or options.prevTX is required.');

    this.path = parsePath(this.path, options.path, 'options.path');

    if (options.prevout != null)
      this.prevout = parsePrevout(this.prevout, options.prevout);

    if (options.output != null)
      this.output = parseOutput(this.output, options.output);

    let coin = null;

    if (options.coin != null)
      coin = parseCoin(options.coin);

    if (coin != null && options.prevout == null) {
      assert(!isMinimalCoin(options.coin),
        'options.prevout is required with minimal coin (no hash/index)');
      this.prevout.fromOptions({
        hash: coin.hash,
        index: coin.index
      });
    }

    if (coin != null && options.output == null)
      this.output.fromOptions(coin);

    this._coin = coin;

    if (options.witness != null) {
      enforce(typeof options.witness === 'boolean',
        'options.witness', 'boolean');
      this.witness = options.witness;
    }

    assert(this.witness || options.prevTX != null,
      'non-witness inputs need prevTX.');

    if (options.prevTX != null) {
      this.prevTX = parseTX(options.prevTX);
      this.output = this.prevTX.outputs[this.prevout.index];

      assert(this.prevTX.hash().equals(this.prevout.hash),
        'prevout hash and prevTX hash do not match.');
    }

    if (options.multisig != null) {
      const multisig = {
        m: options.multisig.m,
        pubkeys: []
      };

      assert((multisig.m >>> 0) === multisig.m,
        'options.multisig.m must be a number.');

      assert(Array.isArray(options.multisig.pubkeys),
        'options.multisig.pubkeys must be an array.');

      assert(options.multisig.pubkeys.length >= options.multisig.m,
        'm must be smaller than n.');

      for (const pk of options.multisig.pubkeys) {
        enforce(typeof pk.xpub === 'string',
          'pubkeys[i].xpub', 'string');
        enforce(typeof pk.signature === 'string',
          'pubkeys[i].signature', 'hex string.');

        let path = new Path();

        path = parsePath(path, pk.path,
          'options.multisig.pubkeys[i].path');
        const pubkey = {
          xpub: pk.xpub,
          path: path,
          signature: pk.signature
        };

        multisig.pubkeys.push(pubkey);
      }

      this.multisig = multisig;
    }

    return this;
  }

  /**
   * Inject JSON data.
   * @param {Object} json
   */

  fromJSON(json) {
    enforce(typeof json === 'object', 'json', 'object');
    enforce(typeof json.path === 'string', 'json.path', 'string');
    enforce(typeof json.witness === 'boolean', 'json.witness', 'boolean');
    assert(json.prevout != null || json.coin != null,
       'json.prevout or json.coin is required.');
    assert(json.output != null || json.coin != null,
       'json.output or json.coin is required.');

    this.path = Path.fromString(json.path);
    this.witness = json.witness;

    if (json.prevout != null)
      this.prevout.fromJSON(json.prevout);

    if (json.output != null)
      this.output.fromJSON(json.output);

    if (json.coin != null && json.prevout == null) {
      assert(typeof json.coin.hash === 'string',
        'Can not use minimal encoded Coin for prevout.');
      assert((json.coin.index >>> 0) === json.coin.index,
        'Can not use minimal encoded Coin for prevout.');

      this.prevout.fromJSON({
        hash: json.coin.hash,
        index: json.coin.index
      });
    }

    if (json.coin != null && json.output == null)
      this.output.fromJSON(json.coin);

    if (json.prevTX != null) {
      this.prevTX = TX.fromRaw(Buffer.from(json.prevTX, 'hex'));
    }

    if (json.multisig != null) {
      enforce((json.multisig.m >>> 0) === json.multisig.m,
        'json.multisig.m', 'number');
      enforce(Array.isArray(json.multisig.pubkeys),
        'json.multisig.pubkeys', 'array');

      const pubkeys = [];

      for (const pk of json.multisig.pubkeys) {
        enforce(typeof pk.xpub === 'string',
          'json.multisig.pubkeys[i].xpub', 'string');
        enforce(typeof pk.path === 'string',
          'json.multisig.pubkeys[i].path', 'string');
        enforce(typeof pk.signature === 'string',
          'json.multisig.pubkeys[i].signature', 'hex string');

        let path = new Path();
        path = parsePath(path, pk.path,
          'json.multisig.pubkeys[i].path');

        pubkeys.push({
          xpub: pk.xpub,
          path: path,
          signature: pk.signature
        });
      }

      this.multisig = {
        m: json.multisig.m,
        pubkeys: pubkeys
      };
    }

    return this;
  }

  getJSON(network) {
    let multisig = null;

    if (this.multisig) {
      multisig = {
        m: this.multisig.m,
        pubkeys: this.multisig.pubkeys.map((pk) => {
          return {
            xpub: pk.xpub,
            path: pk.path.toString(),
            signature: pk.signature
          };
        })
      };
    }

    return {
      path: this.path.toString(),
      prevout: this.prevout.toJSON(),
      witness: this.witness,
      output: this.output.getJSON(network),
      prevTX: this.prevTX ? this.prevTX.toRaw().toString('hex') : null,
      multisig: multisig
    };
  }

  toKey() {
    return this.prevout.toKey();
  }

  get coin() {
    if (!this._coin) {
      this._coin = Coin.fromOptions({
        version: this.prevTX ? this.prevTX.version : null,
        value: this.output.value,
        script: this.output.script,
        coinbase: this.prevout.isNull(),
        hash: this.prevout.hash,
        index: this.prevout.index
      });
    }

    return this._coin;
  }

  refresh() {
    this._coin = null;
  }

  static isInputData(object) {
    return object instanceof this;
  }
}

/*
 * Helpers
 */

function parsePath(currentPath, path, name) {
  if (Path.isPath(path))
    return path;

  if (typeof path === 'string') {
    currentPath.fromString(path);
    return currentPath;
  }

  if (Array.isArray(path)) {
    currentPath.fromList(path, false);
    return currentPath;
  }

  if (typeof path === 'object') {
    currentPath.fromOptions(path);
    return currentPath;
  }

  throw new Error(`Unknown type for ${name}.`);
}

function parseTX(tx) {
  if (Buffer.isBuffer(tx))
    return TX.fromRaw(tx);

  if (typeof tx === 'string')
    return TX.fromRaw(Buffer.from(tx, 'hex'));

   // TX.isTX(tx)
   if (typeof tx === 'object')
    return tx;

  throw new Error('Unknown type for options.prevTX');
}

function parseOutput(currentOutput, output) {
  if (Buffer.isBuffer(output)) {
    currentOutput.fromRaw(output);
    return currentOutput;
  }

  if (typeof output === 'string') {
    currentOutput.fromRaw(Buffer.from(output, 'hex'));
    return currentOutput;
  }

  if (typeof output === 'object') {
    let script = output.script;

    if (typeof output.script === 'string')
      script = Buffer.from(output.script, 'hex');

    let address;

    if (output.address)
      address = output.address;

    currentOutput.fromOptions({
      value: output.value,
      script: script,
      address: address
    });
    return currentOutput;
  }

  throw new Error('Unknown type for options.output.');
}

function parsePrevout(currentPrevout, prevout) {
  if (Buffer.isBuffer(prevout)) {
    currentPrevout.fromRaw(prevout);
    return currentPrevout;
  }

  if (typeof prevout === 'string') {
    currentPrevout.fromRaw(Buffer.from(prevout, 'hex'));
    return currentPrevout;
  }

  if (typeof prevout === 'object') {
    currentPrevout.fromOptions(prevout);
    return currentPrevout;
  }

  throw new Error('Unknown type for options.prevout.');
}

function parseCoin(coin) {
  if (Buffer.isBuffer(coin))
    return Coin.fromRaw(coin);

  if (typeof coin === 'string')
    return Coin.fromRaw(Buffer.from(coin, 'hex'));

  if (typeof coin === 'object') {
    let script = coin.script;

    if (typeof coin.script === 'string')
      script = Buffer.from(script, 'hex');

    return Coin.fromOptions({
      ...coin,
      script: script
    });
  }

  throw new Error('Unknown type for options.coin.');
}

function isMinimalCoin(coin) {
  if (coin == null)
    return true;

  if (Buffer.isBuffer(coin))
    return true;

  if (typeof coin === 'string')
    return true;

  if (typeof coin === 'object') {
    if (coin.index == null)
      return true;

    if (coin.coinbase === false && coin.hash == null)
      return true;

    return false;
  }

  return true;
}

exports.InputData = InputData;
