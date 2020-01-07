/*!
 * deviceledger.js - Ledger device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const bledger = require('bledger');
const DeviceWrapper = require('./device');
const {vendors} = require('../common');
const {Path} = require('../path');
const common = require('./helpers');
const helpers = require('./ledgerhelpers');

const {
  ManagedLedgerBcoin,
  LedgerBcoin,
  USB
} = bledger;

const {Device} = USB;

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

    // default timeout.
    let timeout = 5000;

    if (options.managed != null) {
      assert(typeof options.managed === 'boolean');
      this.managed = options.managed;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('ledger-device-wrapper');
    }

    if (options.timeout != null) {
      assert(typeof options.timeout === 'number');
      timeout = options.timeout;
    }

    if (options.device != null) {
      assert(Device.isLedgerDevice(options.device));
      this.ledgerDevice = options.device;

      // TODO(node): accept options with fromUSBDevice
      // in bledger
      this.ledgerDevice.set({ timeout });

      const LedgerApp = this.managed ? ManagedLedgerBcoin : LedgerBcoin;

      this.ledgerApp = new LedgerApp({
        logger: this.logger,
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
    assert(!this.destroyed, 'Device no longer available.');

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
    assert(!this.destroyed, 'Device no longer available.');

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
    this.ledgerApp = null;
    this.destroyed = true;
  }

  /**
   * Get public key.
   * @param {String|Number[]|Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {bcoin.HDPublicKey}
   */

  async getPublicKey(path, getParentFingerPrint = true) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.ledgerApp, 'Ledger app not found.');

    if (Path.isPath(path))
      path = path.toString();

    assert(Array.isArray(path) || typeof path === 'string');

    this.logger.debug('getting public key for path', path);

    return this.ledgerApp.getPublicKey(path, getParentFingerPrint);
  }

  /**
   * Sign transaction.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {bcoin.MTX}
   */

  async signTransaction(mtx, options) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.ledgerApp, 'Ledger app not found.');

    const {inputTXs, coins, inputData} = common.prepareSignOptions(options);

    const ledgerInputs = helpers.createLedgerInputs(
      mtx,
      inputTXs,
      coins,
      inputData,
      this.network
    );

    const result = await this.ledgerApp.signTransaction(mtx, ledgerInputs);
    this.logger.debug('Transaction was signed.');

    return result;
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {Buffer[]} - signatures
   */

  async getSignatures(mtx, options) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.ledgerApp, 'Ledger app not found.');

    const {inputTXs, coins, inputData} = common.prepareSignOptions(options);

    const ledgerInputs = helpers.createLedgerInputs(
      mtx,
      inputTXs,
      coins,
      inputData,
      this.network
    );

    const result = await this.ledgerApp.getTransactionSignatures(
      mtx,
      mtx.view,
      ledgerInputs
    );

    this.logger.debug('Transaction was signed.');

    return result;
  }

  /**
   * Sign arbitrary message.
   * @param {Path|String} path
   * @param {Buffer|String} message
   * @returns {Buffer}
   */

  async signMessage(path, message) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.ledgerApp, 'Ledger app not found.');

    if (Path.isPath(path))
      path = path.toString();

    assert(Array.isArray(path) || typeof path === 'string');

    return this.ledgerApp.signMessage(path, message);
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
