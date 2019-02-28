'use strict';

const {HDPrivateKey,Network,Mnemonic} = require('bcoin');

// well known test mnemonic
const phrase = [
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'abandon',
  'about'
].join(' ');

// TODO: assert on network type being valid
function testxpub(index = 0, network) {
  if (typeof network === 'string')
    network = Network.get(network);
  const mnemonic = Mnemonic.fromPhrase(phrase);

  // m'
  const priv = HDPrivateKey.fromMnemonic(mnemonic);

  // m'/44'
  const bip44Key = priv.derive(44, true);

  // m'/44'/{0,1}'
  const coinType = network.keyPrefix.coinType;
  const bitcoinKey = bip44Key.derive(coinType, true);

  // m'/44'/0'/${index}'
  const accountKey = bitcoinKey.derive(index, true);

  // turn to public key
  return accountKey.toPublic();
}

exports.testxpub = testxpub;
exports.phrase = phrase;
