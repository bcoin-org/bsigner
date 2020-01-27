/*!
 * Generate signature vectors.
 * ---
 *
 * We want to make sure, tx signing can handle all
 * possible types that can happen in wallets.
 *  + P2PKH
 *  + P2SH
 *  + P2WPKH
 *  + P2WSH
 *  + P2WPKH in P2SH
 *  + P2WSH in P2SH
 *  - NULLDATA - output
 *  - TX With external inputs. -- not supported in trezor-firmware yet.
 *    @see https://github.com/trezor/trezor-firmware/issues/38
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
 *      "tx": "...raw tx hex..",
 *      "inputData": [{
 *        "path": "...",
 *        "witness": true,
 *        "prevTX": "...raw prev tx hex...",
 *        "coin": { ... },
 *        "multisig": { ... }
 *      }]
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
const Script = require('bcoin/lib/script/script');
const {opcodes} = require('bcoin/lib/script/common');
const {HDPrivateKey} = hd;
const MTX = require('bcoin/lib/primitives/mtx');
const {phrase} = require('../test/utils/key');
const {Path} = require('../lib/path');
const fundUtil = require('./utils/fund');

const NETWORK = 'testnet';
const network = Network.get(NETWORK);
const coinType = network.keyPrefix.coinType;

const ADDRESS = '3Bi9H1hzCHWJoFEjc4xzVzEMywi35dyvsV';
const P2PKH_ACC = Path.fromString(`m/44'/${coinType}'/0'`);
const P2SH_ACC = Path.fromString(`m/44'/${coinType}'/1'`);

const deviceMaster = HDPrivateKey.fromPhrase(phrase);
const TEST_MASTER = Buffer.from('0488ade400000000000000000077350243858505f17c'
                              + '36d8cea925ce3dfa273b9924f856b2cfd254aa2b37ae'
                              + '2300609ba5a67b19cb7973ec9657196130f279c0babc'
                              + '4a09c2a9b1ffa5d387c8dcc600bc6753', 'hex');
const testMaster = HDPrivateKey.fromRaw(TEST_MASTER);
// const testMaster = HDPrivateKey.generate();

async function getP2PKHInput(options) {
  const {
    i,
    witness,
    nested,
    network
  } = options;

  const path = P2PKH_ACC.clone().push(0).push(i);
  const changePath = P2PKH_ACC.clone().push(1).push(i);

  const priv = deviceMaster.derivePath(path.toString());
  const addr = hd2addr(priv, network, witness, nested);

  const changePriv = deviceMaster.derivePath(changePath.toString());
  const changeAddr = hd2addr(changePriv, network, witness, nested);

  const {txs, coins} = await fundUtil.fundAddress(addr, 1);

  return {
    path,
    changePath: changePath,
    txs,
    coins,
    changeAddress: changeAddr
  };
}

/**
 * Generate P2SH Input.
 * NOTE: XPUBs array contains device xpub first!
 */

async function getP2SHInput(options) {
  const {
    witness,
    nested,
    network,
    m,
    i
  } = options;

  const path = P2SH_ACC.clone().push(0).push(i);
  const changePath = P2SH_ACC.clone().push(1).push(i);

  const deviceXPUB = deviceMaster.derivePath(P2SH_ACC.toString());
  const deviceHDKey = deviceMaster.derivePath(path.toString());

  const testXPUB = testMaster.derivePath(P2SH_ACC.toString());
  const testHDKey = testMaster.derivePath(path.toString());

  const p2shRing = getP2SHRing(
    testHDKey,
    [testHDKey, deviceHDKey],
    m,
    witness,
    nested
  );

  const testHDChangeKey = testMaster.derivePath(changePath.toString());
  const deviceHDChangeKey = testMaster.derivePath(changePath.toString());

  const changeP2SHRing = getP2SHRing(
    testHDChangeKey,
    [testHDChangeKey, deviceHDChangeKey],
    m,
    witness,
    nested
  );

  const addr = p2shRing.getAddress().toString(network);
  const changeAddr = changeP2SHRing.getAddress().toString(network);

  const {txs, coins} = await fundUtil.fundAddress(addr, 1);

  return {
    txs,
    coins,
    path,
    changePath: changePath,
    rings: [p2shRing],
    xpubs: [deviceXPUB, testXPUB],
    changeAddress: changeAddr
  };
}

/**
 * PAY2PUBKEYHASH
 */

async function generateP2PKH(witness, nested) {
  assert(!nested || witness, 'can not set nested without witness.');

  const {txs, coins, changeAddress, path} = await getP2PKHInput({
    i: 0,
    witness,
    nested,
    network
  });

  const tx = await createTX([coins[0]], changeAddress);

  return {
    tx: tx.toRaw().toString('hex'),
    inputData: [{
      prevTX: txs[0].toRaw().toString('hex'),
      coin: coins[0].getJSON(network),
      path: path.toString(),
      witness: witness
    }]
  };
}

async function generateP2SH(witness, nested) {
  assert(!nested || witness, 'can not set nested without witness.');

  const {
    txs, coins, path, rings, xpubs, changeAddress
  } = await getP2SHInput({
    witness,
    nested,
    network,
    m: 2,
    i: 0
  });

  const tx = await createTX([coins[0]], changeAddress);

  tx.sign(rings[0]);

  const ourSignature = extractSignature(tx.inputs[0], witness);

  // remove script of our input.
  tx.inputs[0].script.clear();
  tx.inputs[0].witness.clear();

  const input = {
    tx: tx.toRaw().toString('hex'),
    inputData: [{
      path: path.toString(),
      witness: witness,
      prevTX: txs[0].toRaw().toString('hex'),
      coin: coins[0].getJSON(network),
      multisig: {
        m: 2,
        pubkeys: [{
          xpub: xpubs[0].xpubkey(network),
          path: Path.fromList(path.toList().slice(3, 5)).toString()
        }, {
          xpub: xpubs[1].xpubkey(network),
          path: Path.fromList(path.toList().slice(3, 5)).toString()
        }],
        signatures: ['', ourSignature]
      }
    }]
  };

  return input;
}

async function createMultitypeTransaction(witness, nested) {
  assert(!nested || witness, 'can not set nested without witness.');

  const p2pkhInputs = [];
  const p2pshInputs = [];

  for (let i = 1; i <= 2; i++) {
    const input = await getP2PKHInput({
      i: i,
      witness,
      nested,
      network
    });

    p2pkhInputs.push(input);
  }

  for (let i = 1; i <= 2; i++) {
    const input = await getP2SHInput({
      m: 2,
      i,
      witness,
      nested,
      network
    });

    p2pshInputs.push(input);
  }

  // external p2pkh input
  // let externalInput = null;
  // {
  //   const priv = testMaster.derivePath('m/44\'/0\'/1\'/0/0');
  //   const addr = hd2addr(priv, network, witness, nested);
  //   const {txs, coins} = await fundUtil.fundAddress(addr, 1);
  //   const ring = KeyRing.fromPrivate(priv.privateKey, true);

  //   externalInput = {
  //     txs,
  //     coins,
  //     ring
  //   };
  // }

  let coins = [];

  for (const input of p2pkhInputs)
    coins = coins.concat(input.coins);

  for (const input of p2pshInputs)
    coins = coins.concat(input.coins);

  // coins = coins.concat(externalInput.coins);

  const tx = await createTX(coins, p2pkhInputs[0].changeAddress);

  const trezorInput = {
    tx: tx.toRaw().toString('hex'),
    inputData: []
  };

  // sign external input
  // tx.sign(externalInput.ring);
  // TODO: test if prevtx is necessary (when implemented in trezor).
  // txs = txs.concat(externalInput.txs);

  // push input data
  for (const input of p2pkhInputs) {
    const inputData = {};

    inputData.path = input.path.toString();
    inputData.witness = witness;
    inputData.prevTX = input.txs[0].toRaw().toString('hex');
    inputData.coin = input.coins[0].getJSON(network);

    trezorInput.inputData.push(inputData);
  }

  for (const input of p2pshInputs) {
    tx.sign(input.rings[0]);

    const signedInput = findInput(tx, input.rings[0]);
    const signature = extractSignature(signedInput, witness);

    trezorInput.inputData.push({
      witness: witness,
      path: input.path.toString(),
      prevTX: input.txs[0].toRaw().toString('hex'),
      coin: input.coins[0].getJSON(network),
      multisig: {
        m: 2,
        pubkeys: [{
          xpub: input.xpubs[0].xpubkey(network),
          path: Path.fromList(input.path.toList().slice(3, 5)).toString()
        }, {
          xpub: input.xpubs[1].xpubkey(network),
          path: Path.fromList(input.path.toList().slice(3, 5)).toString()
        }],
        signatures: ['', signature]
      }
    });
  }

  return trezorInput;
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

  json.vectors.push({
    description: 'P2SH multisig',
    ...await generateP2SH(false, false)
  });

  json.vectors.push({
    description: 'P2WSH multisig',
    ...await generateP2SH(true, false)
  });

  json.vectors.push({
    description: 'Nested P2WSH multisig',
    ...await generateP2SH(true, true)
  });

  json.vectors.push({
    description: 'Multiple input transaction (p2pkh, p2sh)',
    ...await createMultitypeTransaction(false, false)
  });

  json.vectors.push({
    description: 'Multiple input transaction (p2wpkh, p2wsh)',
    ...await createMultitypeTransaction(true, false)
  });

  json.vectors.push({
    description: 'Multiple input transaction (nested-p2wpkh, nested-p2wsh)',
    ...await createMultitypeTransaction(true, true)
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
    value: totalAmount - 50000, // leave some for change.
    address: ADDRESS
  });

  await mtx.fund(coins, {
    subtractFee: true,
    changeAddress: changeAddress
  });

  return mtx;
}

function getP2SHRing(hd, hdpubkeys, m, witness, nested) {
  const pubkeys = hdpubkeys.map(hd => hd.publicKey);
  const multisigScript = Script.fromMultisig(m, pubkeys.length, pubkeys);
  const ring = KeyRing.fromOptions({
    witness,
    nested,
    compress: true,
    key: hd.privateKey,
    script: multisigScript
  });

  return ring;
}

/**
 * Extracts first signature it sees.
 */

function extractSignature(input, witness) {
  let signature = null;

  if (!witness) {
    for (const opcode of input.script.code) {
      if (opcode.value !== opcodes.OP_0 && opcode.data) {
        signature = opcode.data.toString('hex');
        break;
      }
    }
  } else {
    for (const data of input.witness.toArray()) {
      if (data.length > 0) {
        signature = data.toString('hex');
        break;
      }
    }
  }

  assert(signature, 'Could not get the signature.');
  return signature;
}

function findInput(tx, ring) {
  let foundInput = null;
  for (const input of tx.inputs) {
    const {prevout} = input;
    const coin = tx.view.getOutput(prevout);

    if (!coin)
      continue;

    if (ring.ownOutput(coin)) {
      foundInput = input;
      break;
    }
  }

  assert(foundInput, 'Could not find input.');
  return foundInput;
}
