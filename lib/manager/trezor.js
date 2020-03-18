/*!
 * trezor.js - Manage trezor devices
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const trezorConnect = require('btrezor-connect');
const TrezorConnect = trezorConnect.default;
const AbstractDeviceManager = require('./abstract');
const TrezorDevice = require('../device/trezor');
const {vendors} = require('../common');

const {DEVICE, DEVICE_EVENT} = trezorConnect;

/**
 * Trezor Device Manager
 */

class TrezorDeviceManager extends AbstractDeviceManager {
  constructor(options) {
    super();

    this._deviceEventHandler = null;

    if (options != null)
      this.fromOptions(options);
  }

  /**
   * Inject properties from options.
   * @param {Object} options
   */

  fromOptions(options) {
    assert(typeof options === 'object');

    this.options = options;

    if (options.selector != null) {
      assert(typeof options.selector === 'function');
      this.selector = options.selector;
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('trezor-device-manager');
    }

    if (options.network != null)
      this.network = Network.get(options.network);

    if (options.debugTrezor != null) {
      assert(typeof options.debugTrezor === 'boolean');
      this.debugTrezor = options.debugTrezor;
    }

    return this;
  }

  get vendor() {
    return vendors.TREZOR;
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

        const device = TrezorDevice.fromOptions({
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
   * Clean up listeners and destroy device.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;
    this.unbind();

    this.logger.debug('Closing trezor manager.');

    for (const device of this.cachedDevices.values()) {
      if (device.opened)
        await device.close();

      device.destroy();
    }

    await TrezorConnect.stop();

    this.cachedDevices.clear();
  }

  /**
   * Select device:
   *  - You can pass the device instance, if you have one.
   *  - You can pass selector to use similar to ledger on Manager init.
   *  - By default it will select first device.
   *  @param {TrezorDevice?} device - custom device.
   *  @returns {TrezorDevice}
   */

  async selectDevice(device) {
    assert(this.opened, 'Not open.');

    if (device) {
      const handle = device.handle;

      if (!this.cachedDevices.has(handle)) {
        throw new Error('Device not found.');
      }

      await this.deselectDevice();
      this.selected = device;
      this.emit('select', device);

      await device.open();

      return device;
    }

    if (this.cachedDevices.size === 0)
      throw new Error('No devices available.');

    await this.deselectDevice();

    const selected = await this.selector(this.getDevices());

    if (!selected)
      throw new Error('Device was not selected.');

    this.selected = selected;
    this.emit('select', this.selected);

    await this.selected.open();

    return selected;
  }

  /**
   * Deselect current device.
   * @returns {Boolean}
   */

  async deselectDevice() {
    if (!this.selected)
      return false;

    if (this.selected.opened)
      await this.selected.close();

    this.emit('deselect', this.selected);
    this.selected = null;
    return true;
  }

  /**
   * List allowed and connected devices.
   * @returns {TrezorDevice[]}
   */

  getDevices() {
    assert(this.opened, 'Not open.');

    return Array.from(this.cachedDevices.values());
  }

  /**
   * Create TrezorDeviceManager from options.
   * @param {Object} options
   * @returns {TrezorDeviceManager}
   */

  static fromOptions(options) {
    return new this(options);
  }
}

module.exports = TrezorDeviceManager;
