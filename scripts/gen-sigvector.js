/*!
 * Generate signature vectors.
 * ---
 *
 * We want to make sure, tx signing can handle all
 * possible types that can happen in wallets.
 *  - P2PKH
 *  - P2SH
 *  - P2WPKH
 *  - P2WSH
 *  - P2WPKH in P2SH
 *  - P2WSH in P2SH
 *  - NULLDATA
 *  - TX With external inputs.
 *
 * Ideally we will test many combinations of these,
 * but creating 1 transaction for each type
 * and then combinining all input types and creating
 * 1 tx should be enough for now.
 *
 * Because we use specific seed for our devices,
 * we can denerate different type of transactions whenever
 * we want.
 *
 * ## Output
 *
 * This will output json that has all necessary
 * information for signing and we need to choose
 * format that we can reuse across different
 * devices.
 *
 * Current bsigner has similar format, for now
 * we will be using that.
 *
 * ```
 * {
 *  "description": "Signature test vectors.",
 *  "network": "regtest",
 *  "vectors": [
 *    {
 *      "description": "P2PKH",
 *      "tx": "hex",            - raw transaction
 *      "inputTXs": [],         - raw prev transactions array.
 *      "coins": [],            - Currently sorted as inputs.
 *      "paths": [],            - Currently sorted as inputs.
 *      "scripts": [],          - Currently sorted as inputs.
 *
 *       - NOTE: Ideally we want to use coinview, pathview, scriptview or
 *       somethinig similar to coinview that does not depend on the order.
 *    }
 *  ]
 * }
 * ```
 */

'use strict';

const assert = require('bsert');
const Network = require('bcoin/lib/protocol/network');
const hd = require('bcoin/lib/hd');
const KeyRing = require('bcoin/lib/primitives/keyring');
const {HDPrivateKey} = hd;
const MTX = require('bcoin/lib/primitives/mtx');
const {phrase} = require('../test/utils/key');
const {Path} = require('../lib/path');
const fundUtil = require('./utils/fund');

const NETWORK = 'regtest';
const network = Network.get(NETWORK);
const coinType = network.keyPrefix.coinType;

const ADDRESS = '3Bi9H1hzCHWJoFEjc4xzVzEMywi35dyvsV';
const P2PKH_ACC = Path.fromString(`m/44'/${coinType}'/0'`);

const deviceMaster = HDPrivateKey.fromPhrase(phrase);

/**
 * PAY2PUBKEYHASH
 */

async function generateP2PKH(witness, nested) {
  assert(!nested || witness, 'can not set nested without witness.');

  const firstPath = P2PKH_ACC.clone().push(0).push(0);
  const changePath = P2PKH_ACC.clone().push(1).push(0);

  const priv = deviceMaster.derivePath(firstPath.toString());
  const addr = hd2addr(priv, network, witness, nested);

  const chpriv = deviceMaster.derivePath(changePath.toString());
  const chaddr = hd2addr(chpriv, network, witness, nested);

  const {txs, coins} = await fundUtil.fundAddress(addr, 1);

  const tx = await createTX([coins[0]], chaddr);

  return {
    tx: tx.toRaw().toString('hex'),
    inputTXs: [txs[0].toRaw().toString('hex')],
    coins: [coins[0].toJSON()],
    inputData: [{
      path: firstPath.toString(),
      witness: witness
    }]
  };
}

async function main() {
  const json = {
    description: 'Signing vectors for HW devices.',
    network: NETWORK,
    vectors: []
  };

  json.vectors.push({
    description: 'P2PKH',
    ...await generateP2PKH(false, false)
  });

  json.vectors.push({
    description: 'P2WPKH',
    ...await generateP2PKH(true, false)
  });

  json.vectors.push({
    description: 'Nested P2WPKH',
    ...await generateP2PKH(true, true)
  });

  return json;
}

// RUN THE CODE
(async () => {
  const json = await main();

  return json;
})().then((json) => {
  console.log(JSON.stringify(json, null, 2));
}).catch((e) => {
  console.log('sig vector generation failed.');
  console.error(e);
});
main();

// helpers
function hd2addr(hd, network, witness, nested) {
  const keyring = KeyRing.fromPublic(hd.publicKey);
  keyring.witness = witness;
  keyring.nested = nested;

  return keyring.getAddress(network);
}

async function createTX(coins, changeAddress) {
  const mtx = new MTX();

  let totalAmount = 0;

  for (const coin of coins)
    totalAmount += coin.value;

  mtx.addOutput({
    value: totalAmount,
    address: ADDRESS
  });

  await mtx.fund(coins, {
    subtractFee: true,
    changeAddress: changeAddress
  });

  return mtx;
}
