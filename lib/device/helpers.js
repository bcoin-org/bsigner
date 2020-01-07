/*!
 * helpers.js - Common helper utilities for ledger and trezor.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {Path} = require('../path');

const helpers = exports;

/**
 * Do minimal validation and parsing of signing options.
 * @param {Object} options
 * @param {TX[]?} options.inputTXs
 * @param {Object[]} options.inputData
 * @param {Coin[]} options.coins
 * @returns {Object}
 */

helpers.prepareSignOptions = function prepareSignOptions(options) {
  const inputTXs = options.inputTXs || [];
  const coins = options.coins || [];
  const inputData = options.inputData || [];

  for (const input of inputData) {
    if (!input)
      continue;

    if (!input.path)
      continue;

    if (Path.isPath(input.path))
      continue;

    if (Array.isArray(input.path)) {
      input.path = Path.fromList(input.path);
      continue;
    }

    if (typeof input.path === 'string') {
      input.path = Path.fromString(input.path);
      continue;
    }
  }

  return {
    inputTXs,
    coins,
    inputData
  };
};
