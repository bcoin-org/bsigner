/*!
 * memory.js - Device manager for Memory Devices.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const Network = require('bcoin/lib/protocol/network');
const AbstractDeviceManager = require('./abstract');
const MemoryDevice = require('../device/memory');
const {vendors} = require('../common');

class MemoryDeviceManager extends AbstractDeviceManager {
  constructor(options) {
    super();

    this.opened = false;
    this.options = options;
    this.logger = Logger.global;
    this.network = Network.primary;
    this.cachedDevices = new Map();
    this.selected = null;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    assert(options);

    if (options.selector != null) {
      assert(typeof options.selector === 'function');
      this.selector = options.selector;
    }

    if (options.network != null) {
      assert(typeof options.network === 'object');
      this.network = options.network;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger;
    }

    // First device
    if (options.device != null) {
      this.addDevice(options.device);
    } else {
      this.addDevice(options);
    }
  }

  /**
   * Get vendor
   * @returns {String}
   */

  get vendor() {
    return vendors.MEMORY;
  }

  addDevice(options) {
    let device;

    if (options instanceof MemoryDevice) {
      device = options;
    } else {
      device = new MemoryDevice({
        ...this.options,
        ...options
      });
    }

    this.cachedDevices.set(device.handle, device);
    setImmediate(() => {
      this.emit('connect', device);
    });
  }

  async removeDevice(device) {
    if (this.selected === device)
      await this.deselectDevice();

    device.destroy();
    this.cachedDevices.delete(device.handle);
    this.emit('disconnect', device);
  }

  async selectDevice(device) {
    assert(this.opened, 'Not open.');

    if (device) {
      const handle = device.handle;

      if (!this.cachedDevices.has(handle))
        throw new Error('Device not found.');

      await this.deselectDevice();
      this.selected = device;
      this.emit('select', device);

      return device;
    }

    const selected = await this.selector(this.getDevices());

    if (!selected)
      throw new Error('Device was not selected.');

    await this.deselectDevice();
    this.selected = selected;
    this.emit('select', this.selected);

    return this.selected;
  }

  async deselectDevice() {
    if (!this.selected)
      return false;

    if (this.selected.opened)
      await this.selected.close();

    this.emit('deselect', this.selected);
    this.selected = null;

    return true;
  }

  async open() {
    assert(!this.opened, 'Already open.');

    this.opened = true;
  }

  async close() {
    assert(this.opened, 'Not open.');

    await this.deselectDevice();
    for (const device of this.cachedDevices.values()) {
      if (device.opened)
        device.close();

      device.destroy();
    }

    this.cachedDevices.clear();
    this.opened = false;
  }

  /**
   * List allowed and connected devices.
   * @returns {MemoryDevice[]}
   */

  getDevices() {
    assert(this.opened, 'Not open.');

    return Array.from(this.cachedDevices.values());
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
   * Sign transaction
   * @param {bcoin.MTX} tx
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
}

module.exports = MemoryDeviceManager;
