/*!
 * usb-browser.js - USB For browser.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const busb = require('busb');

exports.getUSB = () => {
  return busb.usb;
};
