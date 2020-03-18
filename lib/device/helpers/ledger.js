/*!
 * ledgerhelpers.js - Ledger input transformations and other helpers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {LedgerTXInput} = require('bledger');
const common = require('./common');

const helpers = exports;

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
      redeem = common.getRedeemScript(data, network);

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
