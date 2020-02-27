/*!
 * memdevice.js - Memory device, used for mock.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const MTX = require('bcoin/lib/primitives/mtx');
const HDPrivateKey = require('bcoin/lib/hd/private');
// TODO: maybe use bcoin sig utils (after dependency updates)
const sigUtils = require('bmultisig/lib/utils/sig');
const MultisigMTX = require('bmultisig/lib/primitives/mtx');
const AbstractDeviceWrapper = require('./abstract');
const {vendors} = require('../common');
const common = require('./helpers/common');

let id = 0;

class MemoryDeviceWrapper extends AbstractDeviceWrapper {
  constructor(options) {
    super();

    this.logger = Logger.global;
    this.master = null;
    this.id = id++;
    this._opened = false;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    super.fromOptions(options);

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('mock-device-wrapper');
    }

    let key;

    if (options.phrase != null) {
      assert(typeof options.phrase === 'string');
      key = HDPrivateKey.fromPhrase(options.phrase);
    }

    if (options.key != null) {
      assert(HDPrivateKey.isHDPrivateKey(options.key));
      key = options.key;
    }

    if (key == null)
      key = HDPrivateKey.generate();

    this.master = key;

    return this;
  }

  /**
   * Get vendor of the device.
   * @returns {String}
   */

  get vendor() {
    return vendors.MEMORY;
  }

  /**
   * Handle of the current device.
   * @returns {String}
   */

  get handle() {
    return String(this.id);
  }

  /**
   * Unique identifier of the device.
   * @returns {String}
   */

  get key() {
    return String(this.id);
  }

  get opened() {
    return this._opened;
  }

  async destroy() {
    assert(!this.destroyed, 'Device no longer available.');
    assert(!this.opened, 'Device is open.');

    this.destroyed = true;
  }

  async open() {
    assert(!this.destroyed, 'Device no longer available.');
    assert(!this.opened, 'Device is already open.');

    this._opened = true;
  }

  async close() {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.opened, 'Device is not open.');

    this._opened = false;
  }

  /**
   * Get public key.
   * @param {String|Number[]|Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {bcoin.HDPublicKey}
   */

  async getPublicKey(path, getParentFingerPrint = true) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.opened, 'Device is not open.');

    const key = this.master.derivePath(path.toString());

    return key.toPublic();
  }

  /**
   * Sign transaction.
   * @param {bcoin.TX} tx
   * @param {Object[]} inputData
   * @returns {bcoin.MTX}
   */

  async signTransaction(tx, inputData) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.opened, 'Device is not open.');

    const inputDataMap = common.prepareSignOptions(inputData);
    const mtx = MTX.fromTX(tx);
    const rings = [];

    // setup view and create rings
    for (const inputData of inputDataMap.values()) {
      mtx.view.addCoin(inputData.coin);

      const key = this.master.derivePath(inputData.path.toString());

      const ring = common.createRing(
        inputData,
        key.publicKey,
        this.network,
        key.privateKey
      );

      rings.push(ring);
    }

    const signed = mtx.sign(rings);
    const expectedSigs = tx.inputs.length * rings.length;
    assert(signed === tx.inputs.length,
      `Some inputs were not signed (${signed}/${expectedSigs})`);

    const fmtx = common.applyOtherSignatures(mtx, inputDataMap, this.network);

    return fmtx;
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.TX} tx
   * @param {InputData[]} inputData
   * @returns {Buffer[]} - signatures
   */

  async getSignatures(tx, inputData) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.opened, 'Device is not open.');

    const inputDataMap = common.prepareSignOptions(inputData);
    const msMTX = MultisigMTX.fromTX(tx);

    for (const inputData of inputDataMap.values())
      msMTX.view.addCoin(inputData.coin);

    const rings = [];

    // TODO: Update Multisig MTX so it does not accept sorted array
    // instead uses same approach as BCOIN.
    for (const input of msMTX.inputs) {
      const poKey = input.prevout.toKey();
      const data = inputDataMap.get(poKey);

      assert(data, `Could not get metadata for input ${poKey.toString('hex')}`);
      const key = this.master.derivePath(data.path.toString());
      const ring = common.createRing(
        data,
        key.publicKey,
        this.network,
        key.privateKey
      );

      rings.push(ring);
    }

    // TODO: Multisig - add async support?
    const signatures = msMTX.getSignatures(rings);

    return signatures;
  }

  /**
   * Sign arbitrary message.
   * @param {Path|String} path
   * @param {Buffer|String} message
   * @returns {Buffer}
   */

  async signMessage(path, message) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.opened, 'Device is not open.');

    const key = this.master.derivePath(path.toString());

    return sigUtils.signMessage(message, key.privateKey);
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }

  static generate(options) {
    const key = HDPrivateKey.generate();

    return new this().fromOptions({
      ...options,
      key
    });
  }
}

module.exports = MemoryDeviceWrapper;
