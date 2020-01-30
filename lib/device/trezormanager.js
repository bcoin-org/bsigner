/*!
 * trezormanager.js - Manage trezor devices
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const EventEmitter = require('events');
const Logger = require('blgr');
const Network = require('bcoin/lib/protocol/network');
const trezorConnect = require('btrezor-connect');
const TrezorConnect = trezorConnect.default;
const TrezorDeviceWrapper = require('./trezordevice');
const {vendors} = require('../common');

const {DEVICE, DEVICE_EVENT} = trezorConnect;

const defaultSelector = async (devices) => {
  return devices[0];
};

class TrezorDeviceManager extends EventEmitter {
  constructor(options) {
    super();

    this.opened = false;

    this.options = new TrezorDeviceManagerOptions(options);
    this.logger = this.options.logger;
    this.network = this.options.network;
    this.vendor = vendors.TREZOR;

    // Transport information (on start)
    this.transport = null;
    this.cachedDevices = new Map();
    this.selected = null;

    this._deviceEventHandler = null;
  }

  /**
   * Handle trezor-connect events.
   * @private
   * @param {Object} event - Trezor DEVICE_EVENT.
   */

  handleDeviceEvent(event) {
    const {payload} = event;
    const {type, path} = payload;

    switch (event.type) {
      case DEVICE.CONNECT: {
        if (type !== 'acquired') {
          assert(!this.cachedDevices.has(path));
          break;
        }

        const device = TrezorDeviceWrapper.fromOptions({
          path: path,
          label: payload.label,
          deviceID: payload.features.device_id,
          logger: this.logger,
          network: this.network
        });

        this.cachedDevices.set(path, device);

        this.emit('connect', device);
        break;
      }
      case DEVICE.DISCONNECT: {
        if (!this.cachedDevices.has(path))
          break;

        const device = this.cachedDevices.get(path);
        device.destroy();
        this.cachedDevices.delete(path);
        this.emit('disconnect', device);
        break;
      }
      case DEVICE.CHANGED: {
        if (!this.cachedDevices.has(path))
          break;

        const label = payload.label;
        const status = payload.status;

        const device = this.cachedDevices.get(path);
        device.status = status;
        device.label = label;
        this.logger.debug('Device change:', device);
        break;
      }
      case DEVICE.CONNECT_UNACQUIRED: {
        assert(!this.cachedDevices.has(path));
        break;
      }
      default: {
        this.logger.debug('Event: %s', event.type);
      }
    }
  }

  /**
   * Setup listener.
   * @private
   */

  bind() {
    this._deviceEventHandler = this.handleDeviceEvent.bind(this);

    TrezorConnect.on(DEVICE_EVENT, this._deviceEventHandler);
  }

  /**
   * Remove listener.
   * @private
   */

  unbind() {
    TrezorConnect.off(DEVICE_EVENT, this._deviceEventHandler);

    this._deviceEventHandler = null;
  }

  /**
   * Setup listeners and initialize trezor-connect.
   * @returns {Promise}
   */

  async open() {
    assert(!this.opened, 'Already opened.');
    this.opened = true;

    this.bind();

    await TrezorConnect.init({
      popup: false,
      debug: this.options.debugTrezor,
      manifest: {
        email: '',
        appUrl: ''
      }
    });
  }

  /**
   * Clean up listeners and destroy device wrappers.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;
    this.unbind();

    this.logger.debug('Closing trezor manager.');

    for (const device of this.cachedDevices.values())
      device.destroy();

    await TrezorConnect.stop();

    this.cachedDevices.clear();
  }

  /**
   * Select device:
   *  - You can pass the device wrapper instance, if you have one.
   *  - You can pass selector to use similar to ledger on Manager init.
   *  - By default it will select first device.
   *  @param {TrezorDeviceWrapper?} device - custom device.
   *  @returns {TrezorDeviceWrapper}
   */

  async selectDevice(device) {
    assert(this.opened, 'Not open.');

    if (device) {
      const handle = device.handle;

      if (!this.cachedDevices.has(handle)) {
        throw new Error('Device not found.');
      }

      this.deselectDevice();
      this.selected = device;
      this.emit('select', device);

      return device;
    }

    if (this.cachedDevices.size === 0)
      throw new Error('No devices available.');

    this.deselectDevice();

    const selected = await this.options.selector(this.getDevices());

    if (!selected)
      throw new Error('Device was not selected.');

    this.selected = selected;
    this.emit('select', this.selected);

    return device;
  }

  /**
   * Deselect current device.
   * @returns {Boolean}
   */

  deselectDevice() {
    if (!this.selected)
      return false;

    this.emit('deselect', this.selected);
    this.selected = null;
    return true;
  }

  /**
   * List allowed and connected devices.
   * @returns {LedgerDeviceWrapper[]}
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

  /**
   * Create LedgerDeviceManager from options.
   * @param {Object} options
   * @returns {LedgerDeviceManager}
   */

  static fromOptions(options) {
    return new this(options);
  }
}

class TrezorDeviceManagerOptions {
  constructor(options) {
    this.network = Network.primary;
    this.logger = Logger.global;
    this.selector = defaultSelector;
    this.debugTrezor = false;

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

    if (options.debugTrezor != null) {
      assert(typeof options.debugTrezor === 'boolean');
      this.debugTrezor = options.debugTrezor;
    }
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

module.exports = TrezorDeviceManager;
