/*!
 * ledgerhelpers.js - Ledger input transformations and other helpers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const MultisigMTX = require('bmultisig/lib/primitives/mtx');
const {LedgerTXInput} = require('bledger');
const HDPublicKey = require('bcoin/lib/hd/public');
const Script = require('bcoin/lib/script/script');
const KeyRing = require('bcoin/lib/primitives/keyring');

const helpers = exports;

/**
 * Generate redeem script
 * @param {Object} data
 * @param {Network} network
 * @returns {Script} redeem script.
 */

function getRedeemScript(data, network) {
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
}

/**
 * Create inputs suitable for passing to bledger.
 * @param {TX|MTX} tx
 * @param {Object} inputData
 * @param {Network} network
 * @returns {LedgerTXInput}
 */

helpers.createLedgerInputs = function createLedgerInputs(tx, inputData, network) {
  const ledgerInputs = [];

  for (const input of tx.inputs) {
    const poKey = input.prevout.toKey();
    const data = inputData.get(poKey);

    assert(data, `Could not get metadata for input ${poKey.toString('hex')}`);
    const path = data.path.toList();

    const {multisig, witness, prevTX, coin} = data;

    // bcoin.MTX
    let inputTX = prevTX;

    if (inputTX && inputTX.mutable)
      inputTX = inputTX.toTX();

    let redeem = null;
    if (multisig)
      redeem = getRedeemScript(data, network);

    const ledgerInput = new LedgerTXInput({
      witness,
      redeem,
      coin,
      path,
      index: input.prevout.index,
      tx: inputTX
    });

    ledgerInputs.push(ledgerInput);
  }

  return ledgerInputs;
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

    const {multisig, witness, coin} = data;

    // We only want to apply multisig signatures.
    if (!multisig)
      continue;

    let nested = false;
    if (witness && coin.getType() === 'scripthash')
      nested = true;

    const redeem = getRedeemScript(data, network);

    for (const pkinfo of multisig.pubkeys.values()) {
      if (pkinfo === '')
        continue;

      const signature = Buffer.from(pkinfo.signature, 'hex');
      const hdpub = HDPublicKey.fromBase58(pkinfo.xpub, network);
      const pk = hdpub.derivePath(pkinfo.path.toString());
      const ring = KeyRing.fromOptions({
        witness,
        nested,
        redeem,
        script: redeem,
        publicKey: pk
      });

      msMTX.template(ring);
      msMTX.applySignature(i, coin, ring, signature, false);
    }
  }

  const nmtx = msMTX.toMTX();
  nmtx.view = msMTX.view;

  return nmtx;
};
