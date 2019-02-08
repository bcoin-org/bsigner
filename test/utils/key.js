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
  'about',
].join(' ');

// TODO: assert on network type being valid
function testxpub(index = 0, network = 'regtest') {
  const mnemonic = Mnemonic.fromPhrase(phrase);

  // m'
  const priv = HDPrivateKey.fromMnemonic(mnemonic);

  // m'/44'
  const bip44Key = priv.derive(44, true);

  // technically the network should influece
  // the derivation index here, but only
  // the prefix really matters for encoding
  // which network
  // m'/44'/0'
  const bitcoinKey = bip44Key.derive(0, true);

  // m'/44'/0'/0'
  const accountKey = bitcoinKey.derive(index, true);

  // account extended public key
  // https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#Serialization_format
  const xpub = accountKey.xpubkey(network);

  return xpub;
}

exports.testxpub = testxpub;
