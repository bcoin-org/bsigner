const {Network,MTX,TX,HDPublicKey,Outpoint,Coin} = require('bcoin');
const {bip44} = require('../src/common');

async function prepareSign(wallet, hdpubkey, transaction, config) {
  const network = Network.get(config.str('network'));

  // making an assumption about bip44 here
  // TODO: allow for configurable purpose
  // this can be simplified once we can trust
  // keyinfo.account
  const base = [
    (bip44.purpose | bip44.hardened) >>> 0,
    (bip44.coinType[network.type] | bip44.hardened) >>> 0,
    hdpubkey.childIndex,
  ];

  const paths = [];
  const coins = [];
  const inputTXs = [];

  // TODO: some inputs may not have coin objects
  for (const input of transaction.inputs) {
    if (!input.coin)
      throw new Error('must provide inputs with coin objects');

    const coin = Coin.fromJSON(input.coin);
    coins.push(coin);

    const keyinfo = await wallet.getKey(input.coin.address);
    const path = [...base, keyinfo.branch, keyinfo.index];
    paths.push(path);

    const info = await wallet.getTX(input.prevout.hash);
    const tx = TX.fromRaw(Buffer.from(info.tx, 'hex'));
    inputTXs.push(tx);
  }

  return {
    coins,
    inputTXs,
    paths,
  };
}

exports.prepareSign = prepareSign;
