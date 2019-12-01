/*!
 * ledgermanager.js - Manage ledger devices.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const EventEmitter = require('events');
const Network = require('bcoin/lib/protocol/network');
const busb = require('busb');
const { getUSB } = require('./usb');
const LedgerUSB = require('bledger/lib/device/usb').Device;
const LedgerDeviceWrapper = require('./ledgerdevice');
const { vendors } = require('../common');

const {
  EVENT_DEVICE_CONNECT,
  EVENT_DEVICE_DISCONNECT
} = busb.USB;

/**
 * @typedef {String} DeviceHandle
 */

class LedgerDeviceManager extends EventEmitter {
  constructor(options) {
    super();

    this.opened = false;

    this.options = new LedgerDeviceManagerOptions(options);
    this.usb = this.options.usb;
    this.vendor = vendors.LEDGER;

    this.cachedDevices = new Map();
    this.selected = null;

    this._connectHandler = null;
    this._disconnectHandler = null;
  }

  /**
   * Handle connect.
   * @private
   * @param {busb.USBDevice}
   */

  handleConnect(device) {
    const deviceWrapper = LedgerDeviceWrapper.fromUSBDevice(device);
    const handle = deviceWrapper.handle;

    assert(!this.cachedDevices.has(handle),
      'Already have device for the handle.');

    this.cachedDevices.set(handle, deviceWrapper);
    this.emit('connect', deviceWrapper);
  }

  /**
   * Handle disconnect. Diselect if the device
   * is selected.
   * @private
   * @param {busb.USBDevice} device
   */

  handleDisconnect(device) {
    const handle = device._handle;
    const deviceWrapper = this.cachedDevices.get(handle);

    if (this.selected === deviceWrapper) {
      this.selected.destroy();
      this.deselectDevice();
    }

    this.cachedDevices.delete(handle);

    this.emit('disconnect', deviceWrapper);
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
   * Destroy connected device wrappers.
   * @returns {Promise}
   */

  async close() {
    assert(this.opened, 'Not open.');

    this.opened = false;

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
   * @param {LedgerDeviceWrapper?} device - custom device (for connect event)
   * @returns {LedgerDeviceWrapper}
   */

  async selectDevice(device) {
    assert(this.opened, 'Not open.');

    if (device) {
      const handle = device.handle;

      if (!this.cachedDevices.has(handle)) {
        throw new Error('Device not found.');
      }

      this.selected = device;
      this.emit('select', device);

      return device;
    }

    const ledgerDevice = await LedgerUSB.requestDevice(this.usb);
    const deviceWrapper = LedgerDeviceWrapper.fromLedgerDevice(ledgerDevice);
    const handle = deviceWrapper.handle;

    this.deselectDevice();

    this.selected = deviceWrapper;
    this.cachedDevices.set(handle, deviceWrapper);

    this.emit('select', this.selected);

    return deviceWrapper;
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

  static fromOptions(options) {
    return new this(options);
  }
}

/**
 * Selector callback
 * @callback selectorCallback
 * @async
 * @param {busb.USBDevice[]} devices
 * @returns {busb.USBDevice}
 */

/**
 * Device Manager Options for ledger.
 * @property {busb.USB} usb
 * @property {selectorCallback} selector
 */

class LedgerDeviceManagerOptions {
  constructor(options) {
    this.selector = null;
    this.usb = busb.usb;
    this.network = Network.primary;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    assert(options);

    if (options.selector != null) {
      assert(typeof options.selector === 'function');
      this.selector = options.selector;
      this.usb = getUSB(this.selector);
    }

    if (options.usb != null) {
      assert(options.usb instanceof busb.USB);
      this.usb = options.usb;
    }

    return this;
  }

  static fromOptions(options) {
    return new this().fromOptions(options);
  }
}

module.exports = LedgerDeviceManager;
