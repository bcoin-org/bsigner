/*!
 * manager.js - Device manager that combines trezor and ledger managers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const Logger = require('blgr');
const EventEmitter = require('events');
const LedgerDeviceManager = require('./ledgermanager');
const { vendors } = require('../common');

const AVAILABLE_VENDORS = new Set(Object.values(vendors));
const VENDOR_MANAGERS = {
  [vendors.LEDGER]: LedgerDeviceManager
};

class DeviceManager extends EventEmitter {
  constructor(options) {
    super();

    this.opened = false;
    this.options = new DeviceManagerOptions(options);
    this.network = this.options.network;
    this.logger = this.options.logger;
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
    for (const vendor of this.options.enabledVendors) {
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

      this.cachedDevices.set(handle, device);
      this.emit('connect', device);
    };

    const disconnect = (device) => {
      const handle = getHandle(device);

      this.cachedDevices.delete(handle);
      this.emit('disconnect', device);
    };

    const select = (device) => {
      this.emit('select', device);
    };

    const deselect = (device) => {
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
   * @returns {DeviceWrapper}
   */

  async selectDevice(vendor, device) {
    if (!this.vendorManagers.has(vendor))
      throw new Error(`Vendor "${vendor}" not found or not enabled.".`);

    if (device && vendor !== device.vendor)
      throw new Error('Vendor for manager and device does not match.');

    if (this.selected && this.selected.vendor !== vendor)
      this.vendorManagers.get(this.selected.vendor).deselectDevice();

    return this.vendorManagers.get(vendor).selectDevice(device);
  }

  /**
   * Deselect currently selected device.
   * @returns {Boolean}
   */

  deselectDevice() {
    if (!this.selected)
      return false;

    const vendor = this.selected.vendor;

    return this.vendorManagers.get(vendor).deselectDevice();
  }

  async open() {
    assert(!this.opened, 'Already opened.');

    this.opened = true;

    this.bind();

    for (const manager of this.vendorManagers.values())
      await manager.open();
  }

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;

    for (const manager of this.vendorManagers.values())
      await manager.close();

    this.vendorManagers.clear();
  }

  static fromOptions(options) {
    return new this(options);
  }
}

class DeviceManagerOptions {
  constructor(options) {
    this.network = Network.primary;
    this.logger = Logger.global;
    this.enabledVendors = new Set(AVAILABLE_VENDORS);
    this.vendorManagerOptions = new Map();

    this.fromOptions(options || {});
  }

  fromOptions(options) {
    assert(options);

    if (options.network != null) {
      assert(typeof options.network === 'object');
      this.network = options.network;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('device-manager');
    }

    if (options.vendor != null) {
      // enable all vendors, all vendors are enabled by default.
      if (typeof options.vendor === 'string' && options.vendor !== 'ALL') {
        const vendor = options.vendor;
        assert(AVAILABLE_VENDORS.has(vendor),
          `Could not find vendor "${vendor}".`);

        this.enabledVendors = new Set([vendor]);
      } else if (Array.isArray(options.vendor)) {
        this.enabledVendors = new Set();
        for (const vendorName of options.vendor) {
          const vendor = vendorName.toUpperCase();

          assert(AVAILABLE_VENDORS.has(vendor),
            `Could not find vendor "${vendor}"`);

          this.enabledVendors.add(vendor);
        }
      }
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

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

function getHandle(device) {
  return `${device.vendor}:${device.handle}`;
}

module.exports = DeviceManager;
