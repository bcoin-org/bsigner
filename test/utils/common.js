const {HDPublicKey,KeyRing} = require('bcoin');
const assert = require('bsert');

/*
 * @param {options}
 * @param {options.hdPublicKey}
 */
function deriveFromAccountHDPublicKey(options) {
  // format base58 encoded extended public key
  // network is required for prefix
  const {hdPublicKey,network} = options;
  assert(HDPublicKey.isHDPublicKey(hdPublicKey));
  assert(typeof network === 'string');
  const xpub = hdPublicKey.xpubkey(network);

  // derive receive address
  const {index = 0} = options;

  let result = {};
  const witness = options.witness ? true : false;

  {
    const hd = hdPublicKey.derive(1).derive(index);
    const keyring = KeyRing.fromPublic(hd.publicKey);
    keyring.witness = witness;
    const addr = keyring.getAddress('string', network);
    result.change = {
      keyring: keyring,
      address: addr,
      hdPublicKey: hd,
    }
  }

  {
    assert(typeof index === 'number');
    const hd = hdPublicKey.derive(0).derive(index);
    const keyring = KeyRing.fromPublic(hd.publicKey);
    keyring.witness = witness;
    const addr = keyring.getAddress('string', network);
    result.receive = {
      keyring: keyring,
      address: addr,
      hdPublicKey: hd,
    }
  }

  return result;
}


/*
 * build the inputs to ledgerApp
 * this also works with p2wpkh as well
 */
function p2pkhSignatureInputs(mtx, wallet, accountPath) {
  const inputTXs = [];
  const coins = [];
  const paths = [];

  for (const input of mtx.inputs) {
    const prevhash = input.prevout.hash;
    const tx = wallet.getTX(prevhash);
    inputTXs.push(tx);

    const coin = mtx.view.getCoinFor(input);
    coins.push(coin);

    const base = accountPath.clone();
    const hash = input.getHash(coin);
    const { branch, index } = wallet.getPath(hash);
    paths.push(base.push(branch).push(index));
  }

  return {
    inputTXs,
    coins,
    paths,
  }
}

exports.deriveFromAccountHDPublicKey = deriveFromAccountHDPublicKey;
exports.p2pkhSignatureInputs = p2pkhSignatureInputs;
