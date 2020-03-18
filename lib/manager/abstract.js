/*!
 * abstract.js - Interface and common functionality for device managers.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const EventEmitter = require('events');
const Logger = require('blgr');
const Network = require('bcoin/lib/protocol/network');

const defaultSelector = async (devices) => {
  return devices[0];
};

/**
 * Abstract Device Manager
 *
 * @property {Logger} logger - logger with context
 * @property {Network} network - bcoin network
 * @property {Object} options - last fromOptions.
 * @property {Boolean} opened - whether manager is open
 * @property {AbstractDevice}  selected - selected Device.
 * @property {Set<string, AbstractDeviceManager>} cachedDevices
 *                                                   - list of devices.
 */

class AbstractDeviceManager extends EventEmitter {
  constructor(options) {
    super();

    this.logger = Logger.global.context('device-manager');
    this.network = Network.primary;
    this.options = {};

    this.selector = defaultSelector;
    this.opened = false;
    this.selected = null;
    this.cachedDevices = new Map();

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @param {Object} options
   * @param {Logger?} options.logger
   * @param {Network?} options.network
   */

  fromOptions(options) {
    assert(typeof options === 'object');

    this.options = options;

    if (options.selector != null) {
      assert(typeof options.selector === 'function');
      this.selector = options.selector;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('device-manager');
    }

    if (options.network != null)
      this.network = Network.get(options.network);

    return this;
  }

  /**
   * Get vendor identifier.
   * @returns {String}
   */

  get vendor() {
    throw new Error('Abstract getter.');
  }

  /**
   * Initialize manager.
   * @returns {AbstractDeviceManager}
   */

  init() {
    return this;
  }

  /**
   * Listen to necessary events.
   * @returns {AbstractDeviceManager}
   */

  bind() {
    throw new Error('Abstract method.');
  }

  /**
   * Remove listener.
   * @returns {AbstractDeviceManager}
   */

  unbind() {
    throw new Error('Abstract method.');
  }

  /**
   * Open manager.
   * @returns {Promise<AbstractDeviceManager>}
   */

  async open() {
    throw new Error('Abstract method.');
  }

  /**
   * Close manager.
   * @returns {Promise<AbstractDeviceManager>}
   */

  async close() {
    throw new Error('Abstract method.');
  }

  /**
   * Select device.
   * @param {AbstractDevice?} device
   * @returns {AbstractDevice}
   */

  async selecetDevice(device) {
    throw new Error('Abstract method.');
  }

  /**
   * Deslect device.
   * @returns {Boolean}
   */

  async deselectDevice() {
    throw new Error('Abstract method.');
  }

  /**
   * List available devices.
   * @returns {Promise<AbstractDevice[]>}
   */

  async getDevices() {
    throw new Error('Abstract method.');
  }

  /*
   * API
   */

  /**
   * Get public key of selected device.
   * @param {Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {Promise<HDPublicKey>}
   */

  async getPublicKey(path, getParentFingerPrint = true) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.getPublicKey(path, getParentFingerPrint);
  }

  /**
   * Get public key in xpub string format.
   * @param {Path} path
   * @returns {Promise<string>} - xpub
   */

  async getXPUB(path) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.getXPUB(path);
  }

  /**
   * Sign transaction
   * @param {bcoin.MTX} tx
   * @param {Object} options
   * @returns {Promise<Boolean>}
   */

  async signTransaction(mtx, options) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.signTransaction(mtx, options);
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {Promise<Buffer[]>} - signatures
   */

  async getSignatures(mtx, options) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.getSignatures(mtx, options);
  }

  /**
   * Sign arbitrary message.
   * @param {Path} path
   * @param {Buffer|String} message
   * @returns {Promise<Buffer>} - signature
   */

  async signMessage(path, message) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.signMessage(path, message);
  }

  /*
   * Static
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

module.exports = AbstractDeviceManager;
