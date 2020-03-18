'use strict';

const MTX = require('bcoin/lib/primitives/mtx');
const hd = require('bcoin/lib/hd');
const Outpoint = require('bcoin/lib/primitives/outpoint');
const Coin = require('bcoin/lib/primitives/coin');
const KeyRing = require('bcoin/lib/primitives/keyring');
const Script = require('bcoin/lib/script').Script;

const HDPRIV = Buffer.from('0488ade4000000000000000000ee847d6ae7e82e5cd'
                         + 'b4624eedf26ebb176ba03f1ce57aade0ec6cd94183d'
                         + '554e0082ea8e68898033cd4b3324378e1332a5936fe'
                         + 'b8aeb3b6ed9b4c17d6d7847265c6e451243', 'hex');

const master = hd.HDPrivateKey.fromRaw(HDPRIV);

/*
 * It will fund 1 btc from Coinbase
 * @param {Address} addr
 * @param {Number} inputs - Number of inputs we want to genarate
 * @returns {Object} - keys { txList, coinList }
 */
exports.fundAddressCoinbase = function (addr, inputs) {
  const txs = [];
  const coins = [];

  for (let i = 0; i < inputs; i++) {
    const cb = new MTX();

    cb.addInput({
      prevout: new Outpoint(),
      script: new Script()
    });

    cb.addOutput({
      address: addr,
      value: 100000000 + i
    });

    txs.push(cb);
    coins.push(Coin.fromTX(cb, 0, -1));
  }

  return {
    txs,
    coins
  };
};

/*
 * It will fund 1 btc for each input
 * @param {Address} addr
 * @param {Number} inputs - Number of inputs we want to genarate
 * @returns {Object} - keys { txList, coinList }
 */
exports.fundAddress = async function (addr, inputs) {
  const key = master.derivePath('m/44\'/0\'/0\'/0/0');
  const keyring = new KeyRing(key.privateKey);
  const tmpaddr = keyring.getAddress();

  const fundCoinbase = exports.fundAddressCoinbase(tmpaddr, inputs);
  const cbCoins = fundCoinbase.coins;

  const txs = [];
  const coins = [];

  for (let i = 0; i < inputs; i++) {
    const mtx = new MTX();

    mtx.addOutput({
      address: addr,
      value: 100000000 + i
    });

    await mtx.fund([cbCoins[i]], {
      subtractFee: true,
      changeAddress: tmpaddr
    });

    mtx.sign(keyring);

    txs.push(mtx);
    coins.push(Coin.fromTX(mtx, 0, -1));
  }

  return {
    txs,
    coins
  };
};

/*
 * It will fund 1 btc for each input from segwit address
 * @param {Address} addr
 * @param {Number} inputs - Number of inputs we want to generate
 * @returns {Object} - keys {txList, coinList}
 */
exports.fundAddressFromWitness = async (addr, inputs) => {
  const key = master.derivePath('m/44\'/0\'/1\'/0/0');
  const keyring = new KeyRing(key.privateKey);
  keyring.witness = true;

  const tmpaddr = keyring.getAddress();
  const fundCoinbase = exports.fundAddressCoinbase(tmpaddr, inputs);
  const cbCoins = fundCoinbase.coins;

  const txs = [];
  const coins = [];

  for (let i = 0; i < inputs; i++) {
    const mtx = new MTX();

    mtx.addOutput({
      address: addr,
      value: 100000000 + i
    });

    await mtx.fund([cbCoins[i]], {
      subtractFee: true,
      changeAddress: tmpaddr
    });

    mtx.sign(keyring);

    txs.push(mtx);
    coins.push(Coin.fromTX(mtx, 0, -1));
  }

  return {
    txs,
    coins
  };
};
