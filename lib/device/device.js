/*!
 * device.js - Abstract Device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');

class DeviceWrapper {
  constructor(options) {
    this.destroyed = false;
    this.logger = Logger.global;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    assert(options);

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger.context('device');
    }

    return this;
  }

  get vendor() {
    throw new Error('Abstract method.');
  }

  get handle() {
    throw new Error('Abstract method.');
  }

  get key() {
    throw new Error('Abstract method.');
  }

  get opened() {
    throw new Error('Abstract method.');
  }

  async destroy() {
    throw new Error('Abstract method.');
  }

  async open() {
    throw new Error('Abstract method.');
  }

  async close() {
    throw new Error('Abstract method.');
  }

  async getPublicKey() {
    throw new Error('Abstract method.');
  }

  async signTransaction() {
    throw new Error('Abstract method.');
  }
}

module.exports = DeviceWrapper;
