/*!
 * trezorhelpers.js - Trezor input transformations and other helpers.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const {BufferMap} = require('buffer-map');
const common = require('./helpers');
const helpers = exports;

/**
 * Trezor only accepts main and testnets.
 * We can work around by using testnet for
 * everything other than Main.
 */

const networkMapping = {
  'main': 'Bitcoin',
  'testnet': 'Testnet',
  'regtest': null,
  'simnet': null
};

/**
 * Transform bcoin tx to trezor RefTransaction.
 * @see https://github.com/trezor/connect/blob/82a8c3d4/src/js/types/trezor.js#L156
 * @param {bcoin.TX} tx
 * @returns {Object}
 */

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

/**
 * Process bcoin inputs -> trezor's TransactionInput.
 * Input types:
 *  - SPENDADDRESS = 0;     // standard P2PKH address
 *  - SPENDMULTISIG = 1;    // P2SH multisig address
 *  - EXTERNAL = 2;         // reserved for external inputs (coinjoin)
 *  - SPENDWITNESS = 3;     // native SegWit
 *  - SPENDP2SHWITNESS = 4; // SegWit over P2SH (backward compatible)
 * @param {bcoin.Input} input
 * @param {bcoin.Coin} coin
 * @param {Path} path
 * @param {bcoin.Script} script - redeem script
 * @param {BufferMap<PrevoutHash, bcoin.TX>} refTXs
 * @returns {Object}
 */

function processTrezorInputs(input, coin, inputData, refTXs) {
  const trezorInput = {
    prev_index: -1,
    prev_hash: null,
    sequence: 0,
    script_type: null
  };

  trezorInput.prev_hash = input.prevout.txid();
  trezorInput.prev_index = input.prevout.index;
  trezorInput.sequence = input.sequence;

  const path = inputData.path;

  if (!coin || !path) {
    trezorInput.script_type = 'EXTERNAL';
    return trezorInput;
  }

  assert(coin, 'must provide coin.');

  if (path)
    trezorInput.address_n = path.toList();

  trezorInput.amount = String(coin.value);
  const coinType = coin.getType();
  const prevoutHash = input.prevout.txid();

  let type;
  let refTX = null;

  switch (coinType) {
    case 'pubkey': {
      throw new Error('Not implemented.');
    }
    case 'pubkeyhash': {
      assert(refTXs.has(prevoutHash), 'reference transaction is required.');
      refTX = refTXs.get(prevoutHash);
      type = 'SPENDADDRESS';
      break;
    }

    case 'witnesspubkeyhash': {
      type = 'SPENDWITNESS';
      break;
    }

    case 'witnessscripthash': {
      // need to figure out which to use: SPENDMULTISIG or SPENDWITNESS
      // probably SPENDWITNESS??
      throw new Error('Not supported yet.');
    }

    case 'scripthash': {
      if (!inputData.witness) {
        // We need to accept XPUB/m instead
        throw new Error('Not implemented yet.');
        // assert(refTXs.has(prevoutHash), 'reference transaction is required.')
        // refTX = refTXs.get(prevoutHash);
        // type = 'SPENDMULTISIG';
        // break;
      }

      // nested p2wpkh or p2wsh
      type = 'SPENDP2SHWITNESS';

      // nested p2wsh
      if (inputData.multisig) {
        // We need to accept XPUB/m instead
        throw new Error('Not supported yet.');
        // type = 'SPENDP2SHWITNESS'; ???
        // break;
      }

      break;
    }

    default: {
      throw new Error('Can not figure out input type.');
    }
  }

  assert(type, 'Could not determine type.');
  trezorInput.script_type = type;

  return {
    trezorInput,
    refTX
  };
}

/**
 * Prepare trezor outputs.
 * TODO: Add change path verification. (Verify on the trezor)
 * Output types:
 *  - PAYTOADDRESS = 0;     // string address output; change is a P2PKH address
 *  - PAYTOMULTISIG = 2;    // change output is a multisig address
 *  - PAYTOOPRETURN = 3;    // op_return
 *  - PAYTOWITNESS = 4;     // change output is native SegWit
 *  - PAYTOP2SHWITNESS = 5; // change output is SegWit over P2SH
 * @param {bcoin.Output} output
 * @param {bcoin.Network} network
 * @returns {Object}
 */

function processTrezorOutputs(output, network) {
  const trezorOutput = {};
  const outType = output.getType();

  trezorOutput.amount = String(output.value);

  let type;
  let addr;

  // NOTE:
  //  Do we use PAYTOMULTISIG in case of Legacy P2SH multisig: yes.
  //  Do we PAYTOWITNESS in case of nested (p2wpkh and p2wsh): ??.
  //  CHANGE processing.
  switch (outType) {
    case 'pubkey': {
      addr = output.getAddress();
      assert(addr, 'Could not get the address.');
      type = 'PAYTOADDRESS';
      break;
    }
    case 'pubkeyhash': {
      addr = output.getAddress();
      assert(addr, 'Could not get the address.');
      type = 'PAYTOADDRESS';
      break;
    }
    case 'scripthash': {
      addr = output.getAddress();
      assert(addr, 'Could not get the address.');
      type = 'PAYTOADDRESS';
      break;
    }
    case 'multisig': {
      throw new Error('Not implemented.');
    }
    case 'nulldata': {
      throw new Error('Not implemented.');
      // trezorOut.op_return_data = ...;
    }
    case 'witnesspubkeyhash': {
      addr = output.getAddress();
      assert(addr, 'Could not get the address.');
      type = 'PAYTOADDRESS';
    }
    case 'witnessscripthash': {
      throw new Error('Not implemented.');
    }
  }

  trezorOutput.script_type = type;

  if (addr)
    trezorOutput.address = addr.toString(network);

  return trezorOutput;
}

/**
 * Accumulate transactions in map, to make it
 * easier to select from.
 * @param {bcoin.TX[]} inputTXs
 * @returns {Map<txid, TX>}
 */

function collectInputTXs(inputTXs) {
  const refTransactions = new Map();

  for (const tx of inputTXs) {
    const hash = tx.txid();
    refTransactions.set(hash, tx);
  }

  return refTransactions;
}

/**
 * Prepare trezor device request.
 * @param {TX} tx
 * @param {TX[]} inputTXs
 * @param {Coin[]} coins
 * @param {Path[]} paths
 * @param {Script[]} scripts
 * @param {Network} network
 * @returns {Object}
 */

helpers.createTrezorInputs = function createTrezorInputs(tx, inputTXs, coins, inputData, network) {
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

  const refTXs = collectInputTXs(inputTXs);

  for (const [i, input] of tx.inputs.entries()) {
    const coin = coins[i];
    const {
      trezorInput,
      refTX
    } = processTrezorInputs(input, coin, inputData[i], refTXs);

    if (refTX) {
      const trezorTX = txToTrezor(refTX);
      signRequest.refTxs.push(trezorTX);
    }

    signRequest.inputs.push(trezorInput);
  }

  for (const output of tx.outputs) {
    const trezorOutput = processTrezorOutputs(output, network);
    signRequest.outputs.push(trezorOutput);
  }

  return signRequest;
};
