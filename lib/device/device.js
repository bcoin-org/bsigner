/*!
 * device.js - Abstract Device.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');

class DeviceWrapper {
  constructor(options) {
    this.destroyed = false;
    this.network = Network.primary;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    assert(options);

    if (options.network != null) {
      assert(typeof options.network === 'object');
      this.network = options.network;
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
