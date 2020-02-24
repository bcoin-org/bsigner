/*!
 * helpers.js - Common helper utilities for ledger and trezor.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {BufferMap} = require('buffer-map');
const {Path} = require('../../path');
const {InputData} = require('../../inputData');

const helpers = exports;

helpers.parsePath = function parsePath(path) {
  if (Path.isPath(path))
    return path.clone();

  if (Array.isArray(path))
    return Path.fromList(path);

  if (typeof path === 'string')
    return Path.fromString(path);

  throw new Error('Could not parse path.');
};

/**
 * Do minimal validation and parsing of signing options.
 * @param {Object[]} inputData
 * @returns {Object}
 */

helpers.prepareSignOptions = function prepareSignOptions(inputData) {
  const inputDataMappings = new BufferMap();

  for (let data of inputData) {
    if (!InputData.isInputData(data))
      data = InputData.fromOptions(data);

    const key = data.toKey();

    inputDataMappings.set(key, data);
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
