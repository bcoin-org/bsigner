/*!
 * trezorhelpers.js - Trezor input transformations and other helpers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const helpers = exports;

/**
 * Type definition mappings from bcoin to trezor.
 *
 * Bcoin types:
 *  - PUBKEY: 1,
 *  - PUBKEYHASH: 2,
 *  - SCRIPTHASH: 3,
 *  - MULTISIG: 4,
 *  - NULLDATA: 5,
 *  - WITNESSMALFORMED: 0x80,
 *  - WITNESSSCRIPTHASH: 0x81,
 *  - WITNESSPUBKEYHASH: 0x82
 *
 * Trezor separates input and output types:
 * Input types:
 *  - SPENDADDRESS
 *  - SPENDMULTISIG
 *  - EXTERNAL
 *  - SPENDWITNESS
 *  - SPENDP2SHWITNESS
 *
 * Output types:
 *  - SPENDADDRESS
 *  - SPENDMULTISIG
 *  - EXTERNAL
 *  - SPENDWITNESS
 *  - SPENDP2SHWITNESS
 */

const inputTypeMapping = {
  'pubkeyhash': 'SPENDADDRESS',
  'scripthash': 'SPENDADDRESS', // ???? (With script?)
  'multisig': 'SPENDMULTISIG',
  'witnesspubkeyhash': 'SPENDWITNESS',
  'witnessscripthash': 'SPENDP2SHWITNESS'
};

const outputTypeMapping = {
  'pubkeyhash': 'PAYTOADDRESS',
  'scripthash': 'PAYTOSCRIPTHASH',
  'multisig': 'PAYTOMULTISIG',
  'nulldata': 'PAYTOOPRETURN',
  'witnesspubkeyhash': 'PAYTOWITNESS',
  'witnessscripthash': 'PAYTOP2SHWITNESS'
};

const networkMapping = {
  'main': 'Bitcoin',
  'testnet': 'Testnet',
  'regtest': null,
  'simnet': null
};

helpers.createTrezorInputs = function createTrezorInputs(tx, inputTXs, coins, paths, scripts, network) {
  let trezorCoinName = networkMapping[network.type];

  // Signing itself does not care about address prefix,
  // instead of throwing we just assume network = 'testnet'

  if (!trezorCoinName) {
    network = Network.get('testnet');
    trezorCoinName = networkMapping['testnet'];
  }

  const signRequest = {
    inputs: [],
    outputs: [],
    coin: trezorCoinName,
    refTxs: []
  };

  signRequest.version = tx.version;
  signRequest.lock_time = tx.locktime;
  signRequest.inputs_count = tx.inputs.length;
  signRequest.outputs_count = tx.outputs.length;

  for (const [i, input] of tx.inputs.entries()) {
    const trezorIn = {};
    const path = paths[i];
    const coin = coins[i];

    if (coin) {
      const coinType = coin.getType();
      const trezorInType = inputTypeMapping[coinType];

      assert(trezorInType, `Could not get trezor input type for ${coinType}`);
      trezorIn.script_type = trezorInType;
      trezorIn.amount = String(coin.value);
    }

    if (!coin || !path) {
      trezorIn.script_type = 'EXTERNAL';
    }

    if (path) {
      trezorIn.address_n = path.toList();
    }

    trezorIn.prev_index = input.prevout.index;
    trezorIn.prev_hash = input.prevout.txid();
    trezorIn.sequence = input.sequence;

    signRequest.inputs.push(trezorIn);
  }

  for (const output of tx.outputs) {
    const trezorOut = {};
    const outType = output.getType();
    const trezorOutType = outputTypeMapping[outType];
    const addr = output.getAddress();

    if (addr)
      trezorOut.address = output.getAddress().toString(network);

    trezorOut.amount = String(output.value);
    trezorOut.script_type = trezorOutType;

    // trezorOut.op_return_data = ...;
    signRequest.outputs.push(trezorOut);
  }

  for (const tx of inputTXs) {
    const trezorTX = txToTrezor(tx);
    signRequest.refTxs.push(trezorTX);
  }

  return signRequest;
};

function txToTrezor(tx) {
  const trezorTX = {};

  trezorTX.hash = tx.txid().toString('hex');
  trezorTX.version = tx.version;
  trezorTX.lock_time = tx.locktime;

  trezorTX.inputs = [];

  for (const input of tx.inputs) {
    const trezorIn = {};

    trezorIn.prev_hash = input.prevout.txid().toString('hex');
    trezorIn.prev_index = input.prevout.index;
    trezorIn.sequence = input.sequence;
    trezorIn.script_sig = input.script.toRaw().toString('hex');

    trezorTX.inputs.push(trezorIn);
  }

  trezorTX.bin_outputs = [];

  for (const output of tx.outputs) {
    const trezorOut = {};

    trezorOut.amount = output.value;
    trezorOut.script_pubkey = output.script.toRaw().toString('hex');

    trezorTX.bin_outputs.push(trezorOut);
  }

  return trezorTX;
}
