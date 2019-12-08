/*!
 * deviceledger.js - Ledger device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const {opcodes} = require('bcoin/lib/script/common');
const DeviceWrapper = require('./device');
const {Device} = require('bledger/lib/device/usb');
const {vendors} = require('../common');
const {Path} = require('../path');
const {ManagedLedgerBcoin, LedgerBcoin, LedgerTXInput} = require('bledger');

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

    return this.ledgerApp.getPublicKey(path, getParentFingerPrint);
  }

  /**
   * Sign transaction.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {bcoin.MTX}
   */

  async signTransaction(mtx, options) {
    const inputTXs = options.inputTXs || [];
    const coins = options.coins || [];
    const scripts = options.scripts || [];

    const optionPaths = options.paths || [];
    const paths = [];

    for (let i = 0; i < optionPaths.length; i++) {
      if (Path.isPath(optionPaths[i])) {
        paths[i] = optionPaths[i].toString();
      } else {
        paths[i] = optionPaths[i];
      }
    }

    const ledgerInputs = createLedgerInputs(
      mtx,
      inputTXs,
      coins,
      paths,
      scripts
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
    const inputTXs = options.inputTXs || [];
    const coins = options.coins || [];
    const scripts = options.scripts || [];

    const optionPaths = options.paths || [];
    const paths = [];

    for (let i = 0; i < optionPaths.length; i++) {
      if (Path.isPath(optionPaths[i])) {
        paths[i] = optionPaths[i].toString();
      } else {
        paths[i] = optionPaths[i];
      }
    }

    const ledgerInputs = createLedgerInputs(
      mtx,
      inputTXs,
      coins,
      paths,
      scripts
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

function isSegwit(coin) {
  assert(coin, 'must provide coin');
  const type = coin.getType();

  if (type === 'witnessscripthash' || type === 'witnesspubkeyhash')
    return true;

  return false;
}

function isNested(coin, witness) {
  assert(coin, 'must provide coin');
  const type = coin.getType();

  if (type !== 'scripthash')
    return false;

  const raw = coin.script.raw;

  const isP2WPKH = raw[0] === opcodes.OP_HASH160
    && raw[1] === 0x14
    && raw[22] === opcodes.OP_EQUAL
    && raw.length === (1 + 1 + 20 + 1);

  const isP2WSH = raw[0] === 0x00
    && raw[1] === 0x14
    && raw.length === (1 + 1 + 32);

  return (isP2WPKH || isP2WSH) && (witness.length > 0);
}

function createLedgerInputs(tx, inputTXs, coins, paths, scripts) {
  const ledgerInputs = [];

  for (const [i, input] of tx.inputs.entries()) {
    const path = paths[i];

    // bcoin.MTX
    let inputTX = inputTXs[i];
    if (inputTX.mutable)
      inputTX = inputTX.toTX();

    let redeem;
    if (scripts[i]) {
      redeem = Buffer.from(scripts[i], 'hex');
    } else if (input.redeem) {
      redeem = input.redeem;
    }

    const coin = coins[i];

    const segwit = isSegwit(coin) || isNested(coin, input.witness);

    const ledgerInput = new LedgerTXInput({
      witness: segwit,
      redeem,
      coin,
      path,
      index: input.prevout.index,
      tx: inputTX
    });

    ledgerInputs.push(ledgerInput);
  }

  return ledgerInputs;
}

module.exports = LedgerDeviceWrapper;
