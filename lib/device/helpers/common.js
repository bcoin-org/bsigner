/*!
 * helpers.js - Common helper utilities for ledger and trezor.
 * Copyright (c) 2020, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {enforce} = assert;
const {BufferMap} = require('buffer-map');
const KeyRing = require('bcoin/lib/primitives/keyring');
const HDPublicKey = require('bcoin/lib/hd/public');
const Script = require('bcoin/lib/script/script');
const MultisigMTX = require('bmultisig/lib/primitives/mtx');
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

/**
 * Generate redeem script
 * @param {Object} data
 * @param {Network} network
 * @returns {Script} redeem script.
 */

helpers.getRedeemScript = function getRedeemScript(data, network) {
  assert(data.multisig, 'Can not get redeem script for non-multisig input.');

  const publicKeys = [];

  for (const pkinfo of data.multisig.pubkeys) {
    const hdpub = HDPublicKey.fromBase58(pkinfo.xpub, network);
    const pk = hdpub.derivePath(pkinfo.path.toString());

    publicKeys.push(pk.publicKey);
  }

  const m = data.multisig.m;
  const n = publicKeys.length;

  const script = Script.fromMultisig(m, n, publicKeys);

  return script;
};

/**
 * Create keyring from InputData
 * @param {InputData} inputData
 * @param {Buffer} pubKey
 * @param {Network} network
 * @param {Buffer?} privKey
 */

helpers.createRing = function createRing(inputData, pubKey, network, privKey) {
  enforce(InputData.isInputData(inputData), 'inputData', 'InputData');
  enforce(Buffer.isBuffer(pubKey), 'pubKey', 'Buffer');
  enforce(typeof network === 'object', 'network', 'object');

  if (privKey)
    enforce(Buffer.isBuffer(privKey), 'privKey', 'Buffer');

  const {coin, witness} = inputData;

  let nested = false;

  if (witness && coin.getType() === 'scripthash')
    nested = true;

  let redeem = null;
  if (inputData.multisig)
    redeem = helpers.getRedeemScript(inputData, network);

  const ring = KeyRing.fromOptions({
    witness,
    nested,
    publicKey: pubKey,
    privateKey: privKey
  });

  ring.script = redeem;

  return ring;
};

/**
 * Get transaction signatures and rings
 * @param {MTX} mtx
 * @param {Object} inputData
 * @param {Network} network
 * @returns {Object} - rings and signatures
 */

helpers.applyOtherSignatures = function applyOtherSignatures(mtx, inputData, network) {
  const msMTX = MultisigMTX.fromMTX(mtx);
  msMTX.view = mtx.view;

  for (const [i, input] of msMTX.inputs.entries()) {
    const poKey = input.prevout.toKey();
    const data = inputData.get(poKey);

    assert(data, `Could not get metadata for input ${poKey.toString('hex')}.`);

    const {multisig, coin} = data;

    // We only want to apply multisig signatures.
    if (!multisig)
      continue;

    for (const pkinfo of multisig.pubkeys.values()) {
      if (pkinfo === '')
        continue;

      const signature = Buffer.from(pkinfo.signature, 'hex');
      const hdpub = HDPublicKey.fromBase58(pkinfo.xpub, network);
      const pk = hdpub.derivePath(pkinfo.path.toString());

      const ring = helpers.createRing(data, pk.publicKey, network);

      msMTX.template(ring);
      msMTX.applySignature(i, coin, ring, signature, false);
    }
  }

  const nmtx = msMTX.toMTX();
  nmtx.view = msMTX.view;

  return nmtx;
};
