/*!
 * usb.js - Node.js version for usb with custom selector.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const busb = require('busb');

/**
 * Selector example.
 * @async
 * @param {USBDevice[]} devices
 * @returns {USBDevice}
 */

// eslint-disable-next-line
const defaultSelector = async (devices) => {
  return devices[0];
};

/**
 * @param {Function} selector
 * @returns {USB}
 */

const getUSB = (selector) => {
  if (!selector)
    return busb.usb;

  assert(typeof selector === 'function');

  const usb = new busb.USB({
    devicesFound: selector
  });

  return usb;
};

exports.getUSB = getUSB;
