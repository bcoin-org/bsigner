const {MTX,TX,HDPublicKey,Coin} = require('bcoin');
const assert = require('bsert');
const Config = require('bcfg');
const {bip44,hash,prepareTypes} = require('./common');
const {Path} = require('./path');

/*
 * @param {Object}
 *
 * options.paths []Path
 *
 */
async function prepareSignOld(options) {
  assert(options.tx, 'must pass tx');
  assert(options.tx.hex, 'must pass tx hex');
  assert(options.wallet, 'must pass wallet');

  const tx = options.tx;
  const wallet = options.wallet;

  const mtx = MTX.fromRaw(tx.hex, 'hex');

  // TODO: can multisig backend create txs with many inputs?
  const subtype = mtx.inputs[0].getSubtype();
  const paths = [];

  // for brute search xpub by comparing each key
  // in the multisig key list against keys locally
  let target;

  switch (subtype) {
    case 'multisig': {
      assert(options.paths, 'must pass paths');
      assert(options.network, 'must pass network');
      assert(typeof options.purpose === 'number', 'must pass purpose');

      // if account wasn't passed in, brute force
      // it using the hardware device
      let account;
      if (!(typeof options.account === 'number')) {
        assert(options.hardware, 'must pass hardware');
        // fetch wallet info
        const info = await wallet.getInfo(true);
        if (!info)
          throw new Error('could not fetch account info');
        const keys = new Set(info.account.keys);

        for (const key of keys.values()) {
          const path = Path.fromAccountPublicKey(key);
          const xkey = await options.hardware.getPublicKey(path);
          if (keys.has(xkey.xpubkey(options.network))) {
            target = key;
            break;
          }
        }

        if (!target)
          throw new Error('must pass account index');

        target = HDPublicKey.fromBase58(target);
        // TEMPORARY HACK
        // handle better in the Path class
        account = (target.childIndex | 0x80000000) >>> 0;
        // can now create a Path object from this key instead
        // of just using it for its childIndex
        // that may be more reliable than the way it is
        // done below, would require less user input

      } else {
        assert(typeof options.account === 'number', 'must pass account');
        account = options.account;
      }

      // search for right extended public key

      // paths from multisig backend look like
      // { branch, index, receive, change, nested }
      for (const path of options.paths) {
        assert(typeof path.branch === 'number');
        assert(typeof path.index === 'number');

        const p = Path.fromOptions({
          account: account,
          network: options.network,
          purpose: options.purpose,
          branch: path.branch,
          index: path.index,
        });

        p.freeze();
        paths.push(p);
      }
      break;
    }
    default: {
      // standard wallets fetch paths from wallet server
      const accountInfo = await wallet.getAccount(options.account);
      if (!accountInfo)
        throw new Error('problem fetching account info');

      for (const input of tx.inputs) {
        let p = Path.fromAccountPublicKey(accountInfo.accountKey);
        const keyinfo = await wallet.getKey(input.coin.address);
        p = p.push(keyinfo.branch).push(keyinfo.index);
        p.freeze();
        paths.push(p)
      }
    }
  }

  const coins = [];
  const inputTXs = [];

  for (const input of tx.inputs) {
    if (!input.coin)
      throw new Error('must provide inputs with coin objects');

    const coin = Coin.fromJSON(input.coin);
    coins.push(coin);

    const info = await wallet.getTX(input.prevout.hash);
    const tx = TX.fromRaw(info.tx, 'hex');
    inputTXs.push(tx);
  }

  return {
    coins,
    inputTXs,
    paths,
    mtx,
    xkey: target,
  };
}

async function generateToken(hardware, path) {
  if (!path)
    path = Path.fromList([44,0,0], true);
  const hdpubkey = await hardware.getPublicKey(path);
  const token = hash(hdpubkey.publicKey);
  return token;
}

/*
 * @param {bcoin.MTX|Object} - options.mtx
 *
 */
async function prepareSign(options) {
  const out = {
    paths: [],
    inputTXs: [],
    coins: [],
    scripts: [],
  }

  const {wallet} = options;
  let {tx,paths,path} = options;

  assert(tx)
  assert(wallet);

  // must use fromJSON to build
  // the bcoin.CoinView
  if (!MTX.isMTX(tx))
    tx = MTX.fromJSON(tx);

  // if paths are not passed in
  // assume the same path for each
  // coin up to the account depth
  if (!paths) {
    if (!path) {
      // if path not passed, try to assume path
      const accountInfo = await wallet.getAccount(options.account);
      if (!accountInfo)
        throw new Error('problem fetching account info');
      path = Path.fromAccountPublicKey(accountInfo.accountKey);
    }
    if (!Path.isPath(path))
      path = Path.fromType(path);

    // account level path
    assert(path.depth === 3);
    paths = tx.inputs.map(() => path);
  }

  assert(Array.isArray(paths));

  for (const [i, input] of Object.entries(tx.inputs)) {

    let prevhash = input.prevout.txid();
    const prevTX = await wallet.getTX(prevhash);
    const inputTX = TX.fromRaw(prevTX.tx, 'hex');
    out.inputTXs.push(inputTX);

    const coin = tx.view.getCoinFor(input);
    if (!coin)
      throw new Error('could not fetch coin');
    out.coins.push(coin);

    let base = paths[i];
    const address = coin.getAddress().toString();
    const keyinfo = await wallet.getKey(address);
    if (!keyinfo)
      throw new Error('could not fetch key info');
    const {branch,index} = keyinfo;
    base = base.push(branch).push(index);

    out.paths.push(base);
  }

  return {
    mtx: tx,
    ...out,
  }
}

/*
 * build data structures required
 * for multisig signing
 *
 * @param pmtx
 * @param path
 */
function prepareSignMultisig(options) {
  const {pmtx,path} = options;

  assert(pmtx.tx, 'must pass tx');
  assert(pmtx.paths, 'must pass paths');
  assert(pmtx.scripts, 'must pass scripts');
  assert(pmtx.txs, 'must pass txs');
  assert(Path.isPath(path));

  const out = {
    paths: [],
    inputTXs: [],
    coins: [],
    scripts: [],
  }

  const mtx = MTX.fromJSON(pmtx.tx);

  for (const [i, input] of Object.entries(pmtx.tx.inputs)) {
    // handle path
    const {branch,index} = pmtx.paths[i];
    const keypath = path.clone().push(branch).push(index);
    out.paths.push(keypath);

    // build input tx
    out.inputTXs.push(MTX.fromRaw(pmtx.txs[i], 'hex'));

    // handle script
    out.scripts.push(pmtx.scripts[i]);

    // handle coin
    const coin = Coin.fromJSON(input.coin);
    out.coins.push(coin);
  }

  return {
    mtx,
    ...out,
  }
}

exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;

