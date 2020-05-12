/*!
 * device.js - Abstract Device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const {custom} = require('../internal/custom');

class AbstractDevice {
  constructor(options) {
    this.destroyed = false;
    this.network = Network.primary;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @param {Object} options
   * @returns {AbstractDevice}
   */

  fromOptions(options) {
    assert(options);

    if (options.network != null)
      this.network = Network.get(options.network);

    return this;
  }

  /**
   * Get vendor identifier.
   * @returns {String}
   */

  get vendor() {
    throw new Error('Abstract method.');
  }

  /**
   * Get device handle.
   * @returns {String}
   */

  get handle() {
    throw new Error('Abstract method.');
  }

  /**
   * Get device unique identifier.
   * @returns {String}
   */

  get key() {
    throw new Error('Abstract method.');
  }

  /**
   * Get device status.
   * @returns {Boolean}
   */

  get opened() {
    throw new Error('Abstract method.');
  }

  /**
   * Destroy device.
   */

  async destroy() {
    throw new Error('Abstract method.');
  }

  /**
   * Open the device.
   * @returns {Promise<AbstractDevice>}
   */

  async open() {
    throw new Error('Abstract method.');
  }

  /**
   * Close the device.
   * @returns {Promise<AbstractDevice>}
   */

  async close() {
    throw new Error('Abstract method.');
  }

  /**
   * Inspect device.
   * @returns {String}
   */

  [custom]() {
    return '<Device:'
      + ` vendor=${this.vendor}`
      + ` key=${this.key}`
      + ` handle=${this.handle}`
      + ` opened=${this.opened}`
      + ` destroyed=${this.destroyed}`
      + '>';
  }

  /*
   * API
   */

  /**
   * Get public key.
   * @param {String|Number[]|Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {bcoin.HDPublicKey}
   */

  async getPublicKey(path, getParentFingerPrint = true) {
    throw new Error('Abstract method.');
  }

  /**
   * Get public key in string form.
   * @param {String|Number[]|Path} path
   * @returns {String}
   */

  async getXPUB(path) {
    const pubkey = await this.getPublicKey(path);
    return pubkey.xpubkey(this.network);
  }

  /**
   * Sign transaction.
   * @param {bcoin.TX} tx
   * @param {Object[]} inputData
   * @returns {bcoin.MTX}
   */

  async signTransaction(tx, inputData) {
    throw new Error('Abstract method.');
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.MTX} mtx
   * @param {Object[]} inputData
   * @returns {Buffer[]} - signatures
   */

  async getSignatures(mtx, inputData) {
    throw new Error('Abstract method.');
  }

  /**
   * Sign arbitrary message.
   * @param {Path|String} path
   * @param {Buffer|String} message
   * @returns {Buffer}
   */

  async signMessage(path, message) {
    throw new Error('Abstract method.');
  }
}

module.exports = AbstractDevice;
