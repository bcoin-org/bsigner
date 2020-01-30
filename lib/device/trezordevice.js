/*!
 * trezordevice.js - Trezor Device
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 * https://github.com/bcoin-org/bsigner
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const trezorConnect = require('btrezor-connect');
const TrezorConnect = trezorConnect.default;
const HDPublicKey = require('bcoin/lib/hd/public');
const MTX = require('bcoin/lib/primitives/mtx');
const {vendors} = require('../common');
const DeviceWrapper = require('./device');
const {Path} = require('../path');
const common = require('./helpers');
const helpers = require('./trezorhelpers');

class TrezorDeviceWrapper extends DeviceWrapper {
  constructor(options) {
    super(options);

    this.logger = Logger.global;
    this.path = null;
    this.label = null;
    this.deviceID = null;
    this.status = null;

    this.destroyed = false;
  }

  /**
   * Inject from options.
   */

  fromOptions(options) {
    super.fromOptions(options);
    assert(options);

    assert(typeof options.path === 'string', 'path must be a string.');
    assert(typeof options.label === 'string', 'label must be a string.');
    assert(typeof options.deviceID === 'string', 'deviceID must be a string');

    this.path = options.path;
    this.label = options.label;
    this.deviceID = options.deviceID;

    if (options.status != null) {
      assert(typeof options.status === 'string');
      this.status = options.status;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('trezor-device-wrapper');
    }

    return this;
  }

  /**
   * Get vendor of the device.
   * @returns {String}
   */

  get vendor() {
    return vendors.TREZOR;
  }

  /**
   * This is hardware mapping of the device
   * for the active connection.
   * @returns {String}
   */

  get handle() {
    return this.path;
  }

  /**
   * This is unique identifier of the device itself
   * not the current connection related information.
   * @returns {String}
   */

  get key() {
    return this.deviceID;
  }

  /**
   * Get device open status.
   * Currently trezor device does not return status.
   * @returns {Boolean}
   */

  get opened() {
    return true;
  }

  /**
   * Device is no longer available.
   */

  destroy() {
    assert(!this.destroyed);
  }

  /**
   * Trezor is managed by Trezor Connect and
   * we don't directly communicate with the device,
   * so there are no device related operations that we
   * need to perform.
   *
   * NOTE: This may change in the future.
   */

  async open() {
    assert(!this.destroyed, 'Device no longer available.');
  }

  /**
   * Check: .open
   */

  async close() {
    assert(!this.destroyed, 'Device no longer available.');
  }

  /**
   * Get public key.
   * @param {String|Number[]|Path} path
   * @param {Boolean} [getParentFingerPrint=true]
   * @returns {bcoin.HDPublicKey}
   */

  async getPublicKey(path, getParentFingerPrint = true) {
    assert(!this.destroyed, 'Device no longer available.');

    path = common.parsePath(path);

    this.logger.debug('getting public key for path', path);

    const response = await TrezorConnect.getPublicKey({
      device: {
        path: this.handle
      },
      path: path.toString()
    });

    assertTrezorResponse(response);

    const {payload} = response;

    const hdpub = new HDPublicKey({
      depth: payload.depth,
      childIndex: payload.childNum,
      chainCode: Buffer.from(payload.chainCode, 'hex'),
      publicKey: Buffer.from(payload.publicKey, 'hex'),
      parentFingerPrint: payload.fingerprint
    });

    return hdpub;
  }

  /**
   * Sign transaction and return signatures.
   * @param {bcoin.MTX} mtx
   * @param {Object} options
   * @returns {Buffer[]} - signatures
   */

  async getSignatures(mtx, options) {
    assert(!this.destroyed, 'Device no longer available.');
    this.logger.debug('getting signatures for transaction.');
    throw new Error('Not implemented.');
  }

  /**
   * Sign transaction.
   * @param {bcoin.MTX} mtx
   * @param {Object[]} inputData
   * @returns {bcoin.MTX}
   */

  async signTransaction(mtx, inputData) {
    assert(!this.destroyed, 'Device no longer available.');
    this.logger.debug('sign transaction');

    inputData = common.prepareSignOptions(inputData);

    const trezorOptions = helpers.createTrezorInputs(
      mtx,
      inputData,
      this.network
    );

    const response = await TrezorConnect.signTransaction({
      device: {
        path: this.handle
      },
      ...trezorOptions
    });

    assertTrezorResponse(response);

    const nmtx = MTX.fromRaw(Buffer.from(response.payload.serializedTx, 'hex'));
    nmtx.view = mtx.view;

    common.injectMTX(mtx, nmtx);

    return nmtx;
  }

  /**
   * Sign arbitrary message.
   * @param {Path|String} path
   * @param {Buffer|String} message
   * @returns {Buffer}
   */

  async signMessage(path, message) {
    assert(!this.destroyed, 'Device no longer available.');
    assert(Buffer.isBuffer(message) || typeof message === 'string',
      'message must be a buffer or a string.');

    path = common.parsePath(path);
    this.logger.debug('Signing message using path:', path);

    if (typeof message === 'string')
      message = Buffer.from(message, 'utf8');

    if (Buffer.isBuffer(message))
      message = message.toString('hex');

    const response = await TrezorConnect.signMessage({
      device: {
        path: this.handle
      },
      path: path.toList(),
      message: message,
      hex: true
    });

    assertTrezorResponse(response);

    const signature = Buffer.from(response.payload.signature, 'base64');
    return signature;
  }

  /**
   * Create device wrapper from options.
   * @param {Object} options
   */

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

function assertTrezorResponse(response) {
  if (response.success)
    return;

  if (!response.payload || !response.payload.error) {
    throw new Error('Unknown error without payload.');
  }

  throw new Error(response.payload.error);
}

module.exports = TrezorDeviceWrapper;
