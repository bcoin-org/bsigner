/*!
 * ledger.js - Manage ledger devices.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const busb = require('busb');
const {getUSB} = require('../internal/usb');
const LedgerUSB = require('bledger/lib/device/usb').Device;
const LedgerDevice = require('../device/ledger');
const AbstractDeviceManager = require('./abstract');
const {vendors} = require('../common');

const {
  EVENT_DEVICE_CONNECT,
  EVENT_DEVICE_DISCONNECT
} = busb.USB;

/**
 * Selector callback
 * @callback selectorCallback
 * @async
 * @param {busb.USBDevice[]} devices
 * @returns {busb.USBDevice}
 */

/**
 * Ledger Device Manager
 *
 * @property {Number} timeout
 * @property {busb.USB} usb
 * @property {selectorCallback} selector
 */

class LedgerDeviceManager extends AbstractDeviceManager {
  constructor(options) {
    super(options);

    this.usb = busb.usb;
    this.timeout = 5000;

    this._connectHandler = null;
    this._disconnectHandler = null;

    if (options)
      this.fromOptions(options);
  }

  /**
   * Inject properties from Options
   * @param {Object} options
   * @param {Object} options
   * @param {Logger?} options.logger
   * @param {Network?} options.network
   * @param {selectorCallback} options.selector
   * @param {busb#USB} options.usb
   * @param {Number} options.timeout
   * @returns {LedgerDevice}
   */

  fromOptions(options) {
    assert(typeof options === 'object');

    this.options = options;

    if (options.selector != null) {
      assert(typeof options.selector === 'function');
      this.selector = options.selector;
      this.usb = getUSB(this.selector);
    }

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('ledger-device-manager');
    }

    if (options.network != null)
      this.network = Network.get(options.network);

    if (options.usb != null) {
      assert(options.usb instanceof busb.USB);
      this.usb = options.usb;
    }

    if (options.timeout != null) {
      assert(typeof options.timeout === 'number');
      this.timeout = options.timeout;
    }

    return this;
  }

  get vendor() {
    return vendors.LEDGER;
  }

  /**
   * Handle connect.
   * @private
   * @param {busb.USBDevice}
   */

  handleConnect(usbDevice) {
    const device = LedgerDevice.fromUSBDevice(usbDevice,
      this.options);
    const handle = device.handle;

    assert(!this.cachedDevices.has(handle),
      'Already have device for the handle.');

    this.cachedDevices.set(handle, device);
    this.emit('connect', device);
  }

  /**
   * Handle disconnect. Diselect if the device
   * is selected.
   * @private
   * @param {busb.USBDevice} usbDevice
   */

  handleDisconnect(usbDevice) {
    const handle = usbDevice._handle;
    const device = this.cachedDevices.get(handle);

    if (this.selected === device) {
      this.selected.destroy();
      this.deselectDevice();
    }

    this.cachedDevices.delete(handle);

    this.emit('disconnect', device);
  }

  /**
   * Listen to connect/disconnect events. We need
   * to later unbind our handlers, so we cache them.
   * @private
   */

  bind() {
    this._connectHandler = this.handleConnect.bind(this);
    this._disconnectHandler = this.handleDisconnect.bind(this);

    this.usb.on(EVENT_DEVICE_CONNECT, this._connectHandler);
    this.usb.on(EVENT_DEVICE_DISCONNECT, this._disconnectHandler);
  }

  /**
   * Remove our event listeners from usb.
   * @private
   */

  unbind() {
    this.usb.removeListener(EVENT_DEVICE_CONNECT, this._connectHandler);
    this.usb.removeListener(EVENT_DEVICE_DISCONNECT, this._disconnectHandler);

    this._connectHandler = null;
    this._disconnectHandler = null;
  }

  /**
   * Start listening to events
   * @returns {Promise}
   */

  async open() {
    assert(!this.opened, 'Already opened.');

    this.opened = true;

    this.bind();
  }

  /**
   * Clean up listeners and cache.
   * Destroy connected devices.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;

    for (const device of this.cachedDevices.values()) {
      if (device.opened)
        await device.close();

      device.destroy();
    }

    this.cachedDevices.clear();
    this.unbind();
  }

  /**
   * Select device is general way to select devices
   * Get permissions to listen to the events.
   * Even though it is not necessary to open
   * manager to select device, this is here
   * in order to detect disconnection and inform
   * user that device was deselected.
   * @param {LedgerDevice?} device - custom device (for connect event)
   * @returns {LedgerDevice}
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

      await device.open();
      return device;
    }

    const ledgerDevice = await LedgerUSB.requestDevice(this.usb);
    device = LedgerDevice.fromLedgerDevice(ledgerDevice,
      this.options);
    const handle = device.handle;

    device.fromOptions(this.options);

    await this.deselectDevice();

    this.selected = device;
    this.cachedDevices.set(handle, device);

    await this.selected.open();

    this.emit('select', this.selected);

    return device;
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
   * @returns {Promise<LedgerDevice[]>}
   */

  async getDevices() {
    assert(this.opened, 'Not open.');

    return Array.from(this.cachedDevices.values());
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

module.exports = LedgerDeviceManager;
