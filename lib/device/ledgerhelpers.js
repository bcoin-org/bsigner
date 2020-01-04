/*!
 * ledgerhelpers.js - Ledger input transformations and other helpers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const {opcodes} = require('bcoin/lib/script/common');
const {LedgerTXInput} = require('bledger');

const helpers = exports;

function isSegwit(coin) {
  assert(coin, 'must provide coin');
  const type = coin.getType();

  if (type === 'witnessscripthash' || type === 'witnesspubkeyhash')
    return true;

  return false;
}

function isNested(coin, witness) {
  assert(coin, 'must provide coin');
  const type = coin.getType();

  if (type !== 'scripthash')
    return false;

  const raw = coin.script.raw;

  const isP2WPKH = raw[0] === opcodes.OP_HASH160
    && raw[1] === 0x14
    && raw[22] === opcodes.OP_EQUAL
    && raw.length === (1 + 1 + 20 + 1);

  const isP2WSH = raw[0] === 0x00
    && raw[1] === 0x14
    && raw.length === (1 + 1 + 32);

  return (isP2WPKH || isP2WSH) && (witness.length > 0);
}

helpers.createLedgerInputs = function createLedgerInputs(tx, inputTXs, coins, paths, scripts) {
  const ledgerInputs = [];

  for (const [i, input] of tx.inputs.entries()) {
    const path = paths[i];

    // bcoin.MTX
    let inputTX = inputTXs[i];
    if (inputTX.mutable)
      inputTX = inputTX.toTX();

    let redeem;
    if (scripts[i]) {
      redeem = Buffer.from(scripts[i], 'hex');
    } else if (input.redeem) {
      redeem = input.redeem;
    }

    const coin = coins[i];

    const segwit = isSegwit(coin) || isNested(coin, input.witness);

    const ledgerInput = new LedgerTXInput({
      witness: segwit,
      redeem,
      coin,
      path,
      index: input.prevout.index,
      tx: inputTX
    });

    ledgerInputs.push(ledgerInput);
  }

  return ledgerInputs;
}
