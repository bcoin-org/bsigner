/*!
 * deviceledger.js - Ledger device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const bledger = require('bledger');
const AbstractDevice = require('./abstract');
const {vendors} = require('../common');
const MTX = require('bcoin/lib/primitives/mtx');
const CoinView = require('bcoin/lib/coins/coinview');
const common = require('./helpers/common');
const helpers = require('./helpers/ledger');

const {
  ManagedLedgerBcoin,
  LedgerBcoin,
  USB
} = bledger;

const {Device} = USB;

class LedgerDevice extends AbstractDevice {
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
      this.logger = options.logger.context('ledger-device');
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
    assert(!this.opened, 'Can not destroy open device.');
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

    path = common.parsePath(path);

    this.logger.debug('getting public key for path', path);

    return this.ledgerApp.getPublicKey(path.toString(), getParentFingerPrint);
  }

  /**
   * Sign transaction.
   * @param {bcoin.TX} tx
   * @param {Object[]} inputData
   * @returns {bcoin.MTX}
   */

  async signTransaction(tx, inputData) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.ledgerApp, 'Ledger app not found.');

    const inputDataMap = common.prepareSignOptions(inputData);
    const ledgerInputs = helpers.createLedgerInputs(
      tx,
      inputDataMap,
      this.network
    );

    const mtx = MTX.fromTX(tx);

    // add coins to the view.
    for (const data of inputDataMap.values())
      mtx.view.addCoin(data.coin);

    await this.ledgerApp.signTransaction(mtx, ledgerInputs);
    this.logger.debug('Transaction was signed.');

    const nmtx = common.applyOtherSignatures(mtx, inputDataMap, this.network);
    return nmtx;
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.TX} tx
   * @param {Object[]} inputData
   * @returns {Buffer[]} - signatures
   */

  async getSignatures(tx, inputData) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(this.ledgerApp, 'Ledger app not found.');

    const inputDataMap = common.prepareSignOptions(inputData);
    const view = new CoinView();

    for (const data of inputData)
      view.addCoin(data.coin);

    const ledgerInputs = helpers.createLedgerInputs(
      tx,
      inputDataMap,
      this.network
    );

    const result = await this.ledgerApp.getTransactionSignatures(
      tx,
      view,
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

    path = common.parsePath(path);

    const pathstr = path.toString();
    const signature = await this.ledgerApp.signMessage(pathstr, message);
    return signature.toCoreSignature();
  }

  /**
   * Create device from options.
   * @param {Object} options
   * @returns {LedgerDevice}
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }

  /**
   * Create LedgerDevice from bledger.Device.
   * @param {bledger.Device}
   * @param {Object} [options = {}]
   * @returns {LedgerDevice}
   */

  static fromLedgerDevice(device, options = {}) {
    return this.fromOptions({ ...options, device });
  }

  /**
   * Create LedgerDevice from USBDevice.
   * @param {busb.USBDevice}
   * @param {Object} [options = {}]
   * @returns {LedgerDevice}
   */

  static fromUSBDevice(device, options = {}) {
    const ledgerDevice = Device.fromDevice(device);

    return this.fromLedgerDevice(ledgerDevice, options);
  }
}

module.exports = LedgerDevice;
