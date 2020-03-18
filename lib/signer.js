/*!
 * signer.js - Main interface for the bsigner.
 * Copyright (c) 2019-2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const Logger = require('blgr');
const EventEmitter = require('events');
const AbstractDevice = require('./device/abstract');
const LedgerDeviceManager = require('./manager/ledger');
const TrezorDeviceManager = require('./manager/trezor');
const MemoryDeviceManager = require('./manager/memory');
const {AVAILABLE_VENDORS, vendors, parseVendors} = require('./common');

const VENDOR_MANAGERS = {
  [vendors.LEDGER]: LedgerDeviceManager,
  [vendors.TREZOR]: TrezorDeviceManager,
  [vendors.MEMORY]: MemoryDeviceManager
};

/**
 * Signer
 *
 * Main interface for managers and API.
 * @todo Add getDevices.
 */
class Signer extends EventEmitter {
  constructor(options) {
    super();

    this.opened = false;
    this.options = new SignerOptions(options);
    this.network = this.options.network;
    this.logger = this.options.logger;
    this.enabledVendors = this.options.enabledVendors;
    this.deviceManagers = new Map();
    this.cachedDevices = new Map();
    this.selected = null;

    this.init();
  }

  /**
   * Initalize device manager,
   * Create vendor managers.
   * @private
   */

  init() {
    for (const vendor of this.enabledVendors) {
      const options = this.options.vendorManagerOptions.get(vendor);
      const manager = new VENDOR_MANAGERS[vendor](options);

      this.deviceManagers.set(vendor, manager);
    }
  }

  /**
   * Start listening to vendor manager events.
   * @private
   */

  bind() {
    const connect = (device) => {
      const handle = getHandle(device);

      assert(!this.cachedDevices.has(handle),
        'Already have device for the handle.');

      this.logger.debug('Device connected: ', device);

      this.cachedDevices.set(handle, device);
      this.emit('connect', device);
    };

    const disconnect = (device) => {
      const handle = getHandle(device);

      this.logger.debug('Device disconnected: ', device);
      this.cachedDevices.delete(handle);
      this.emit('disconnect', device);
    };

    const select = (device) => {
      this.selected = device;
      this.logger.debug('Device was selected: ', device);
      this.emit('select', device);
    };

    const deselect = (device) => {
      if (device === this.selected) {
        this.logger.debug('Device was deselected: ', device);
        this.selected = null;
      }

      this.emit('deselect', device);
    };

    for (const manager of this.deviceManagers.values()) {
      manager.on('connect', connect);
      manager.on('disconnect', disconnect);
      manager.on('select', select);
      manager.on('deselect', deselect);
    }
  }

  /**
   * Select device
   * @param {String} vendor
   * @param {AbstractDevice} device
   * @returns {Promise<AbstractDevice>}
   */

  async selectDevice(vendor, device) {
    if (!device && vendor instanceof AbstractDevice) {
      device = vendor;
      vendor = device.vendor;
    }

    if (!this.deviceManagers.has(vendor))
      throw new Error(`Vendor "${vendor}" not found or not enabled.`);

    if (device && vendor !== device.vendor)
      throw new Error('Vendor for manager and device does not match.');

    if (this.selected && this.selected.vendor !== vendor)
      await this.deviceManagers.get(this.selected.vendor).deselectDevice();

    const selected = await this.deviceManagers.get(vendor).selectDevice(device);
    return selected;
  }

  /**
   * Deselect currently selected device.
   * @returns {Promise<Boolean>}
   */

  async deselectDevice() {
    if (!this.selected)
      return false;

    const vendor = this.selected.vendor;

    return this.deviceManagers.get(vendor).deselectDevice();
  }

  /**
   * Open all enabled vendor managers.
   * @returns {Promise}
   */

  async open() {
    assert(!this.opened, 'Already opened.');

    this.opened = true;

    this.bind();

    for (const manager of this.deviceManagers.values())
      await manager.open();
  }

  /**
   * Close all enabled vendor managers.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;

    for (const manager of this.deviceManagers.values())
      await manager.close();
  }

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
   * Sign transaction.
   * @param {bcoin.MTX} mtx
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
   * @param {Promise<Buffer|String>} message
   */

  async signMessage(path, message) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.signMessage(path, message);
  }

  /**
   * Create device manager from options.
   * @returns {Signer}
   */

  static fromOptions(options) {
    return new this(options);
  }
}

/**
 * DeviceManager Options
 * @property {Network} network
 * @property {Logger} logger
 * @property {Set<String>} enabledVendors
 * @property {Map<String, Object>} vendorManagerOptions
 */

class SignerOptions {
  constructor(options) {
    this.network = Network.primary;
    this.logger = Logger.global;
    this.enabledVendors = new Set(AVAILABLE_VENDORS);
    this.vendorManagerOptions = new Map();

    this.fromOptions(options || {});
  }

  /**
   * Init device manager options from options.
   * @param {Object} options
   * @param {Network} [options.network=Network.primary]
   * @param {Logger} [options.logger=Logger.global]
   * @param {String|Set<String>|String[]} options.vendor
   * @param {Object} options[vendor] - additional options for each vendor
   * @returns {SignerOptions}
   */

  fromOptions(options) {
    assert(options);

    if (options.network != null) {
      this.network = Network.get(options.network);
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('signer');
    }

    if (options.vendor != null) {
      this.enabledVendors = parseVendors(options.vendor);
    }

    for (const vendor of this.enabledVendors.values()) {
      this.vendorManagerOptions.set(vendor, {
        network: this.network,
        logger: this.logger,
        ...options[vendor]
      });
    }

    return this;
  }

  /**
   * Create DeviceManagerOptions from options.
   * @param {Object} options
   * @returns {SignerOptions}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

function getHandle(device) {
  return `${device.vendor}:${device.handle}`;
}

module.exports = Signer;
