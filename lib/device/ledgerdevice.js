/*!
 * deviceledger.js - Ledger device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const DeviceWrapper = require('./device');
const {Device} = require('bledger/lib/device/usb');
const {vendors} = require('../common');
const {Path} = require('../path');
const {ManagedLedgerBcoin, LedgerBcoin} = require('bledger');

class LedgerDeviceWrapper extends DeviceWrapper {
  constructor(options) {
    super(options);

    this.logger = Logger.global;
    this.ledgerDevice = null;
    this.ledgerApp = null;
    this.managed = true;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject options.
   * @param {Object} options
   * @param {bledger.Device} options.device
   */

  fromOptions(options) {
    super.fromOptions(options);
    assert(options);

    if (options.managed != null) {
      assert(typeof options.managed === 'boolean');
      this.managed = options.managed;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('ledger-device-wrapper');
    }

    if (options.device != null) {
      assert(Device.isLedgerDevice(options.device));
      this.ledgerDevice = options.device;

      const LedgerApp = this.managed ? ManagedLedgerBcoin : LedgerBcoin;

      this.ledgerApp = new LedgerApp({
        device: this.ledgerDevice,
        network: this.network
      });
    }

    return this;
  }

  /**
   * Get vendor of the device.
   * @returns {String}
   */

  get vendor() {
    return vendors.LEDGER;
  }

  /**
   * Get busb device.
   * @returns {busb.USBDevice}
   */

  get usbDevice() {
    return this.ledgerDevice.device;
  }

  /**
   * This is hardware mapping of the device
   * for the active connection.
   * @returns {String}
   */

  get handle() {
    return this.usbDevice._handle;
  }

  /**
   * This is unique identifier of the device itself
   * not the current connection related information.
   * @returns {String}
   */

  get key() {
    const device = this.usbDevice;

    return `${device.vendorId}:${device.productId}:${device.serialNumber}`;
  }

  get opened() {
    return this.ledgerDevice.opened;
  }

  /**
   * Open ledger device.
   * @returns {Promise}
   */

  async open() {
    assert(!this.destroyed, 'Can not open destroyed device.');

    if (this.managed)
      return;

    assert(!this.opened);
    await this.ledgerDevice.open();
  }

  /**
   * Close ledger device.
   * @returns {Promise}
   */

  async close() {
    if (this.managed)
      return;

    assert(this.opened);
    await this.ledgerDevice.close();
  }

  /**
   * Device is no longer available.
   * Destroy the instance (it is automatically closed.)
   * We use this state to detect reopen attempt.
   */

  destroy() {
    assert(!this.destroyed);
    this.destroyed = true;
  }

  /**
   * Get public key.
   * @param {String|Number[]|Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {bcoin.HDPublicKey}
   */

  async getPublicKey(path, getParentFingerPrint = true) {
    if (Path.isPath(path))
      path = path.toString();

    assert(Array.isArray(path) || typeof path === 'string');

    this.logger.debug('getting public key for path', path);

    return await this.ledgerApp.getPublicKey(path, getParentFingerPrint);
  }

  async signTransaction() {
    assert(this.opened);
    throw new Error('Not implemented.');
  }

  /**
   * Create device wrapper from options.
   * @param {Object} options
   * @returns {LedgerDeviceWrapper}
   */

  static fromOptions(options) {
    return new this(options);
  }

  /**
   * Create wrapper from LedgerDevice.
   * @param {bledger.Device}
   * @param {Object} [options = {}]
   * @returns {LedgerDeviceWrapper}
   */

  static fromLedgerDevice(device, options = {}) {
    return this.fromOptions({ ...options, device });
  }

  /**
   * Create wrapper from USBDevice.
   * @param {busb.USBDevice}
   * @param {Object} [options = {}]
   * @returns {LedgerDeviceWrapper}
   */

  static fromUSBDevice(device, options = {}) {
    const ledgerDevice = Device.fromDevice(device);

    return this.fromLedgerDevice(ledgerDevice, options);
  }
}

module.exports = LedgerDeviceWrapper;
