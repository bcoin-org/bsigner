/*!
 * manager.js - Device manager that combines trezor and ledger managers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const Logger = require('blgr');
const EventEmitter = require('events');
const DeviceWrapper = require('./device');
const LedgerDeviceManager = require('./ledgermanager');
const TrezorDeviceManager = require('./trezormanager');
const {AVAILABLE_VENDORS, vendors, parseVendors} = require('../common');

const VENDOR_MANAGERS = {
  [vendors.LEDGER]: LedgerDeviceManager,
  [vendors.TREZOR]: TrezorDeviceManager
};

class DeviceManager extends EventEmitter {
  constructor(options) {
    super();

    this.opened = false;
    this.options = new DeviceManagerOptions(options);
    this.network = this.options.network;
    this.logger = this.options.logger;
    this.enabledVendors = this.options.enabledVendors;
    this.vendorManagers = new Map();
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

      this.vendorManagers.set(vendor, manager);
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

    for (const manager of this.vendorManagers.values()) {
      manager.on('connect', connect);
      manager.on('disconnect', disconnect);
      manager.on('select', select);
      manager.on('deselect', deselect);
    }
  }

  /**
   * Select device
   * @param {String} vendor
   * @param {DeviceWrapper} device
   * @returns {Promise<DeviceWrapper>}
   */

  async selectDevice(vendor, device) {
    if (!device && vendor instanceof DeviceWrapper) {
      device = vendor;
      vendor = device.vendor;
    }

    if (!this.vendorManagers.has(vendor))
      throw new Error(`Vendor "${vendor}" not found or not enabled.`);

    if (device && vendor !== device.vendor)
      throw new Error('Vendor for manager and device does not match.');

    if (this.selected && this.selected.vendor !== vendor)
      this.vendorManagers.get(this.selected.vendor).deselectDevice();

    return this.vendorManagers.get(vendor).selectDevice(device);
  }

  /**
   * Deselect currently selected device.
   * @returns {Promise<Boolean>}
   */

  async deselectDevice() {
    if (!this.selected)
      return false;

    const vendor = this.selected.vendor;

    return this.vendorManagers.get(vendor).deselectDevice();
  }

  /**
   * Open all enabled vendor managers.
   * @returns {Promise}
   */

  async open() {
    assert(!this.opened, 'Already opened.');

    this.opened = true;

    this.bind();

    for (const manager of this.vendorManagers.values())
      await manager.open();
  }

  /**
   * Close all enabled vendor managers.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;

    for (const manager of this.vendorManagers.values())
      await manager.close();
  }

  /**
   * Get public key of selected device.
   * @param {Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {HDPublicKey}
   */

  getPublicKey(path, getParentFingerPrint = true) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.getPublicKey(path, getParentFingerPrint);
  }

  /**
   * Sign transaction.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {Boolean}
   */

  signTransaction(mtx, options) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.signTransaction(mtx, options);
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {Buffer[]} - signatures
   */

  getSignatures(mtx, options) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.getSignatures(mtx, options);
  }

  /**
   * Sign arbitrary message.
   * @param {Path} path
   * @param {Buffer|String} message
   */

  signMessage(path, message) {
    assert(this.selected, 'Device was not selected.');
    return this.selected.signMessage(path, message);
  }

  /**
   * Create device manager from options.
   * @returns {DeviceManager}
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

class DeviceManagerOptions {
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
   * @returns {DeviceManagerOptions}
   */

  fromOptions(options) {
    assert(options);

    if (options.network != null) {
      this.network = Network.get(options.network);
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('device-manager');
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
   * @returns {DeviceManagerOptions}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

function getHandle(device) {
  return `${device.vendor}:${device.handle}`;
}

module.exports = DeviceManager;
