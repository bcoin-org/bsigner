/*!
 * helpers.js - Common helper utilities for ledger and trezor.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {Path} = require('../path');
const {BufferMap} = require('buffer-map');
const TX = require('bcoin/lib/primitives/tx');

const helpers = exports;

helpers.parsePath = function parsePath(path) {
  if (Path.isPath(path))
    return path;

  if (Array.isArray(path))
    return Path.fromList(path);

  if (typeof path === 'string')
    return Path.fromString(path);

  throw new Error('Could not parse path.');
};

helpers.parseTX = function parseTX(tx) {
  if (typeof tx === 'object')
    return tx;

  if (typeof tx === 'string')
    return TX.fromRaw(Buffer.from(tx, 'hex'));

  throw new Error('Could not parse TX.');
};

helpers.parseCoin = function parseCoin(coin) {
  if (typeof coin === 'object')
    return coin;

  throw new Error('Could not parse Coin.');
};

/**
 * Do minimal validation and parsing of signing options.
 * @param {Object[]} inputData
 * @returns {Object}
 */

helpers.prepareSignOptions = function prepareSignOptions(inputData) {
  const inputDataMappings = new BufferMap();

  for (const data of inputData) {
    assert(data, 'input metadata is not available.');

    // Maybe accept for Ledger ?
    assert(data.path, 'Path is required. (external inputs not supported)');

    const path = helpers.parsePath(data.path);
    const prevTX = helpers.parseTX(data.prevTX);
    const coin = helpers.parseCoin(data.coin);
    const witness = Boolean(data.witness);
    const multisig = data.multisig;
    const key = coin.toKey();

    inputDataMappings.set(key, {
      path,
      prevTX,
      coin,
      witness,
      multisig
    });
  };

  return inputDataMappings;
};

/**
 * Inject final script into passed MTX,
 * we do this to be consistent with Bcoin API
 * TODO: Maybe deprecate mutation from the main API.
 */

helpers.injectMTX = function (target, source) {
  assert(target.inputs.length === source.inputs.length,
    'source and target must be the same.');

  for (const [i, input] of target.inputs.entries()) {
    const sourceInput = source.inputs[i];

    assert(input.prevout.equals(sourceInput.prevout),
     'source and target inputs must be the same.');

    input.script.fromArray(sourceInput.script.toArray());
    // NOTE: Script and Witness from array are different,
    // script will mutate existing object, where witness
    // will change array reference.
    // TODO: Maybe modify witness fromArray to match
    // script behaviour.
    input.witness.fromArray(sourceInput.witness.toArray());
  }
};
