/*!
 * ledgerhelpers.js - Ledger input transformations and other helpers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {LedgerTXInput} = require('bledger');

const helpers = exports;

helpers.createLedgerInputs = function createLedgerInputs(tx, inputTXs, coins, inputData) {
  const ledgerInputs = [];

  for (const [i, input] of tx.inputs.entries()) {
    const path = inputData[i].path.toList();
    const multisig = inputData[i].multisig;
    const witness = inputData[i].witness;

    // bcoin.MTX
    let inputTX = inputTXs[i];
    if (inputTX.mutable)
      inputTX = inputTX.toTX();

    let redeem;
    if (multisig) {
      throw new Error('Not implemented.');
    }

    const coin = coins[i];

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
