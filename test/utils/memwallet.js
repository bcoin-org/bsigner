/*!
 * memwallet.js - in-memory wallet object for bcoin
 * Copyright (c) 2014-2016, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const {BufferMap} = require('buffer-map');
const Network = require('bcoin/lib/protocol/network');
const MTX = require('bcoin/lib/primitives/mtx');
const HDPublicKey = require('bcoin/lib/hd/public');
const HD = require('bcoin/lib/hd/hd');
const {BloomFilter} = require('bfilter');
const KeyRing = require('bcoin/lib/primitives/keyring');
const Outpoint = require('bcoin/lib/primitives/outpoint');
const Coin = require('bcoin/lib/primitives/coin');

class MemWallet {
  constructor(options) {
    this.network = Network.primary;
    this.master = null;
    this.key = null;
    this.witness = false;
    this.account = 0;
    this.receiveDepth = 1;
    this.changeDepth = 1;
    this.receive = null;
    this.change = null;
    this.map = new BufferMap();
    this.coins = new BufferMap();
    this.spent = new BufferMap();
    this.paths = new BufferMap();
    this.balance = 0;
    this.txs = 0;
    this.filter = BloomFilter.fromRate(1000000, 0.001, -1);

    this.watchOnly = false;
    this.xpub = null;

    if (options)
      this.fromOptions(options);

    this.init();
  }

  fromOptions(options) {
    if (options.network != null) {
      assert(options.network);
      this.network = Network.get(options.network);
    }

    // allow for watch only
    if (options.watchOnly != null) {
      assert(typeof options.watchOnly === 'boolean');
      this.watchOnly = options.watchOnly;
    }

    // pass in extended public key
    if (options.xpub != null) {
      assert(this.watchOnly === true);
      assert(typeof options.xpub === 'string');
      this.xpub = options.xpub;
    }

    if (options.master != null) {
      assert(options.master);
      this.master = HD.PrivateKey.fromOptions(options.master, this.network);
    }

    if (options.key != null) {
      assert(HD.isPrivate(options.key));
      this.key = options.key;
    }

    if (options.witness != null) {
      assert(typeof options.witness === 'boolean');
      this.witness = options.witness;
    }

    if (options.account != null) {
      assert(typeof options.account === 'number');
      this.account = options.account;
    }

    if (options.receiveDepth != null) {
      assert(typeof options.receiveDepth === 'number');
      this.receiveDepth = options.receiveDepth;
    }

    if (options.changeDepth != null) {
      assert(typeof options.changeDepth === 'number');
      this.changeDepth = options.changeDepth;
    }

    return this;
  }

  init() {
    if (!this.master && this.watchOnly === false)
      this.master = HD.PrivateKey.generate();

    if (!this.key && this.watchOnly === false) {
      const type = this.network.keyPrefix.coinType;
      this.key = this.master.deriveAccount(44, type, this.account);
    }

    if (this.watchOnly === true) {
      this.key = HDPublicKey.fromBase58(this.xpub);
    }

    let lookahead = this.receiveDepth;
    for (let i = 0; i < lookahead; i++)
      this.createReceive(i);
    lookahead = this.changeDepth;
    for (let i = 0; i < lookahead; i++)
      this.createChange(i);
  }

  createReceive(index) {
    if (typeof index !== 'number') {
      index = this.receiveDepth;
      this.receiveDepth++;
    }
    const key = this.deriveReceive(index);
    const hash = key.getHash();
    this.filter.add(hash);
    this.paths.set(hash, new Path(hash, 0, index));
    this.receive = key;
    return key;
  }

  createChange(index) {
    if (typeof index !== 'number') {
      index = this.changeDepth;
      this.changeDepth++;
    }
    const key = this.deriveChange(index);
    const hash = key.getHash();
    this.filter.add(hash);
    this.paths.set(hash, new Path(hash, 1, index));
    this.change = key;
    return key;
  }

  deriveReceive(index) {
    return this.deriveKey(0, index);
  }

  deriveChange(index) {
    return this.deriveKey(1, index);
  }

  derivePath(path) {
    return this.deriveKey(path.branch, path.index);
  }

  deriveKey(branch, index) {
    const type = this.network.keyPrefix.coinType;

    let key;
    if (this.master)
      key = this.master.deriveAccount(44, type, this.account);
    else
      key = this.key;

    key = key.derive(branch).derive(index);

    const opt = {
      network: this.network,
      witness: this.witness
    };

    if (key.privateKey)
      opt.privateKey = key.privateKey;
    if (key.publicKey)
      opt.publicKey = key.publicKey;

    const ring = new KeyRing(opt);
    ring.witness = this.witness;

    return ring;
  }

  getKey(hash) {
    const path = this.paths.get(hash);

    if (!path)
      return null;

    return this.derivePath(path);
  }

  getPath(hash) {
    return this.paths.get(hash);
  }

  getCoin(key) {
    return this.coins.get(key);
  }

  getTX(hash) {
    return this.map.get(hash);
  }

  getUndo(key) {
    return this.spent.get(key);
  }

  addCoin(coin) {
    const op = new Outpoint(coin.hash, coin.index);
    const key = op.toKey();

    this.filter.add(op.toRaw());

    this.spent.delete(key);

    this.coins.set(key, coin);
    this.balance += coin.value;
  }

  removeCoin(key) {
    const coin = this.coins.get(key);

    if (!coin)
      return;

    this.spent.set(key, coin);
    this.balance -= coin.value;

    this.coins.delete(key);
  }

  getAddress() {
    return this.receive.getAddress();
  }

  getReceive() {
    return this.receive.getAddress();
  }

  getChange() {
    return this.change.getAddress();
  }

  getCoins() {
    const coins = [];

    for (const coin of this.coins.values())
      coins.push(coin);

    return coins;
  }

  syncKey(path) {
    switch (path.branch) {
      case 0:
        if (path.index === this.receiveDepth - 1)
          this.createReceive();
        break;
      case 1:
        if (path.index === this.changeDepth - 1)
          this.createChange();
        break;
      default:
        assert(false);
        break;
    }
  }

  addBlock(entry, txs) {
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      this.addTX(tx, entry.height);
    }
  }

  removeBlock(entry, txs) {
    for (let i = txs.length - 1; i >= 0; i--) {
      const tx = txs[i];
      this.removeTX(tx, entry.height);
    }
  }

  addTX(tx, height) {
    const hash = tx.hash();
    let result = false;

    if (height == null)
      height = -1;

    if (this.map.has(hash))
      return true;

    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const op = input.prevout.toKey();
      const coin = this.getCoin(op);

      if (!coin)
        continue;

      result = true;

      this.removeCoin(op);
    }

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      const addr = output.getHash();

      if (!addr)
        continue;

      const path = this.getPath(addr);

      if (!path)
        continue;

      result = true;

      const coin = Coin.fromTX(tx, i, height);

      this.addCoin(coin);
      this.syncKey(path);
    }

    if (result) {
      this.txs += 1;
      this.map.set(hash, tx);
    }

    return result;
  }

  removeTX(tx, height) {
    const hash = tx.hash();
    let result = false;

    if (!this.map.has(hash))
      return false;

    for (let i = 0; i < tx.outputs.length; i++) {
      const op = new Outpoint(hash, i).toKey();
      const coin = this.getCoin(op);

      if (!coin)
        continue;

      result = true;

      this.removeCoin(op);
    }

    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const op = input.prevout.toKey();
      const coin = this.getUndo(op);

      if (!coin)
        continue;

      result = true;

      this.addCoin(coin);
    }

    if (result)
      this.txs -= 1;

    this.map.delete(hash);

    return result;
  }

  deriveInputs(mtx) {
    const keys = [];

    for (let i = 0; i < mtx.inputs.length; i++) {
      const input = mtx.inputs[i];
      const coin = mtx.view.getOutputFor(input);

      if (!coin)
        continue;

      const addr = coin.getHash();

      if (!addr)
        continue;

      const path = this.getPath(addr);

      if (!path)
        continue;

      const key = this.derivePath(path);

      keys.push(key);
    }

    return keys;
  }

  fund(mtx, options) {
    const coins = this.getCoins();

    if (!options)
      options = {};

    return mtx.fund(coins, {
      selection: options.selection || 'age',
      round: options.round,
      depth: options.depth,
      hardFee: options.hardFee,
      subtractFee: options.subtractFee,
      changeAddress: this.getChange(),
      height: -1,
      rate: options.rate,
      maxFee: options.maxFee
    });
  }

  template(mtx) {
    const keys = this.deriveInputs(mtx);
    mtx.template(keys);
  }

  sign(mtx) {
    const keys = this.deriveInputs(mtx);
    mtx.template(keys);
    mtx.sign(keys);
  }

  async create(options) {
    const mtx = new MTX(options);

    await this.fund(mtx, options);

    assert(mtx.getFee() <= MTX.Selector.MAX_FEE, 'TX exceeds MAX_FEE.');

    mtx.sortMembers();

    if (options.locktime != null)
      mtx.setLocktime(options.locktime);

    this.sign(mtx);

    if (!mtx.isSigned())
      throw new Error('Cannot sign tx.');

    return mtx;
  }

  async send(options) {
    const mtx = await this.create(options);
    this.addTX(mtx.toTX());
    return mtx;
  }
}

class Path {
  constructor(hash, branch, index) {
    this.hash = hash;
    this.branch = branch;
    this.index = index;
  }
}

module.exports = MemWallet;
