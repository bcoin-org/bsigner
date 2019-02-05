
// TODO: turn into proxy
// with getting asserting
// valid get on coinType
const bip44 = {
  purpose: 44,
  coinType: {
    main: 0,
    testnet: 1,
    regtest: 1,
    simnet: 1,
  },
  hardened: 0x80000000,
};

const vendors = {
  LEDGER: 'ledger',
  TREZOR: 'trezor',
};

/*
 * Build Bitcoin bip44 path to
 * account extended public key,
 * represented as an array of integers
 *
 * TODO: turn into class
 *
 * @param index {Integer}
 * @param network {String}
 * @param options.hardened {Boolean}
 * @returns {[]Integer}
 */
function HDAccountKeyPath(index, network, { hardened }) {
  if (hardened)
    index = (index | bip44.hardened) >>> 0;

  const coinType = bip44.coinType[network];

  return [
    (bip44.purpose | bip44.hardened) >>> 0,
    (coinType | bip44.hardened) >>> 0,
    index,
  ];
}

function HDAccountKeyString(path) {
  let result = ['m\''];
  for (const uint of path) {
    // BUG
    if ((bip44.hardened & uint) === uint)
      result.push((uint ^ bip44.hardened) + '\'');
    else
      result.push(uint);
  }
  return result.join('/');
}


/*
 *
 */
function parsePath(path, hard) {
  assert(typeof path === 'string');
  assert(typeof hard === 'boolean');
  assert(path.length >= 1);
  assert(path.length <= 3062);

  const parts = path.split('/');
  const root = parts[0];

  if (root !== 'm' && root !== 'M' && root !== "m'" && root !== "M'") {
    throw new Error('Invalid path root.');
  }

  const result = [];

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i];

    const hardened = part[part.length - 1] === "'";

    if (hardened) part = part.slice(0, -1);

    if (part.length > 10) throw new Error('Path index too large.');

    if (!/^\d+$/.test(part)) throw new Error('Path index is non-numeric.');

    let index = parseInt(part, 10);

    if (index >>> 0 !== index) throw new Error('Path index out of range.');

    if (hardened) {
      index |= HARDENED;
      index >>>= 0;
    }

    if (!hard && index & HARDENED)
      throw new Error('Path index cannot be hardened.');

    result.push(index);
  }

  return result;
}

function sleep(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
}

exports.bip44 = bip44;
exports.vendors = vendors;
exports.parsePath = parsePath;
exports.HDAccountKeyPath = HDAccountKeyPath;
exports.HDAccountKeyString = HDAccountKeyString;
exports.sleep = sleep;

