/*!
 * deviceledger.js - Ledger device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const DeviceWrapper = require('./device');
const { Device } = require('bledger/lib/device/usb');
const { vendors } = require('../common');

class LedgerDeviceWrapper extends DeviceWrapper {
  constructor(options) {
    super(options);

    this.ledgerDevice = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject options.
   * @param {Object} options
   * @param {bledger.Device} options.device
   */

  fromOptions(options) {
    assert(options);

    if (options.device != null) {
      assert(Device.isLedgerDevice(options.device));
      this.ledgerDevice = options.device;
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
    assert(!this.opened);
    assert(!this.destroyed, 'Can not open destroyed device.');
    await this.ledgerDevice.open();
  }

  /**
   * Close ledger device.
   * @returns {Promise}
   */

  async close() {
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

  async getPublicKey() {
    assert(this.opened);
    throw new Error('Not implemented.');
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
    return new this().fromOptions(options);
  }

  /**
   * Create wrapper from LedgerDevice.
   * @param {bledger.Device}
   * @returns {LedgerDeviceWrapper}
   */

  static fromLedgerDevice(device) {
    return new this({ device });
  }

  /**
   * Create wrapper from USBDevice.
   * @param {busb.USBDevice}
   * @returns {LedgerDeviceWrapper}
   */

  static fromUSBDevice(device) {
    const ledgerDevice = Device.fromDevice(device);

    return this.fromLedgerDevice(ledgerDevice);
  }
}

module.exports = LedgerDeviceWrapper;
