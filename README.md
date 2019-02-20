# hardwarelib

## bcoin Ledger + Trezor

## Features

- Node.js `Hardware` Class with Ledger and Trezor Support
- CLI tooling for end to end work with `bcoin`
- Pull extended public keys, create watch only wallets/accounts
- Sign transactions, broadcast to the network

## Library Usage

`libsigner` helps to manage watch only wallets using `bcoin`.

### Exposed Classes/Functions

##### Hardware

A class to manage signing. Currently only supports Hardware devices,
but will be generalized into an abstract `Signer` in the future.

```javascript

const {Hardware,Path} = require('libsigner');

(async () => {

  // create bip44 xpub path
  const path = Path.fromList([44,0,0], true);

  const hardware = Hardware.fromOptions({
    vendor: 'ledger',    // supports ledger
    network: 'regtest',  // main, testnet, regtest, or simnet
  });
  
  const hdpubkey = await hardware.getPublicKey(path);

})().catch(e => {
  console.log(e.stack);
  process.exit(1);
});

```

Use in conjunction with [bcoin](https://github.com/bcoin-org/bcoin/)
to sign transactions using the hardware wallet device.


```javascript
const {WalletClient} = require('bclient');
const {Newtork} = require('bcoin');
const {Path,prepareSign} = require('libsigner');

const network = Network.get('regtest');

const client = new WalletClient({
  port: network.walletPort,
  network: network.type,
});

const wallet = client.wallet('primary');
const path = Path.fromList([44,0,0], true);

const tx = await wallet.createTX({
  account: 'default',
  rate: 1e3,
  outputs: [{ value: 1e4, address: receiveAddress }],
  sign: false,
});

const {coins,inputTXs,paths,mtx} = await prepareSign({
  tx: tx,
  wallet: walletClient.wallet(walletId),
  path: path.clone(),
});

const signed = await hardware.signTransaction(mtx, {
  paths,
  inputTXs,
  coins,
});

console.log(signed.verify());
// true
```

##### Path

A class to manage [bip44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)
wallets. This class can be used in conjunction with the `Hardware` class
to make deriving keys on the device more simple.

- Create abstractions over hardened indices (no more manual bitwise or)
- Represent as string or list of uint256
- Throw errors in "strict" mode, when path depth exceeds 5
- Infer path from extended [public key](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#serialization-format)

Commonly seen notation for a hardened index includes `0'` or `0h`. Under the hood,
the hardened index is not `0`, its representations are shown below:

- `0 | 0x80000000`
- `1 << 31`
- `2147483648`
- `0b10000000000000000000000000000000`

Different paths correspond to different coins. See [slip44](https://github.com/satoshilabs/slips/blob/master/slip-0044.md)
to learn the mapping between coin types and coins.

Create a `Path` that represents the path to the
keypair that locks a particular utxo

```javascript
const {Path} = require('libsigner');

// create a Path instance for bitcoin mainnet
const path = Path.fromList([44,0,0], true);

console.log(path.toString());
// 'm\'/44\'/0\'/0\''

console.log(path.toList());
// [ 2147483692, 2147483648, 2147483648 ]

// clone path to reuse the same
// account depth path for another tx
// from same account
let myTXPath = path.clone();

// fetch branch and index from someplace
const branch = 0;
const index = 0;

myTXPath = myTXPath.push(branch).push(index);

console.log(myTXPath.toString());
// 'm\'/44\'/0\'/0\'/0/0'

console.log(myTXPath.toList());
// [ 2147483692, 2147483648, 2147483648, 0, 0 ]

```

## CLI Usage

Quickly pull [bip 32](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#serialization-format)
extended public keys from your hardware devices

```bash
$ ./bin/pubkeys.js --vendor ledger --index 0 --network regtest
[info] using path: m'/44'/1'/0'
[info] extended public key:
       rpubKBA5VcKMuu9dL6h7EYEkRniRQrxUonUzKrfobuRyq9owBVqD8ficLXnx7dT9LeKmQBmqvq39LFkf5443qf4dHJ9E25qXZPbFUDURukYUJiTP
[info] legacy receive address:
       R9aYxZvZA3yLn23bLA7gKYrwRwMUcGrjZ3
[info] segwit receive address:
       rb1qqdygq5uskfect93805u3g8h8ysy38a7alfrjr4

```

### Notes

Signing transactions with both legacy and segwit
inputs will not work on ledger and trezor hardware 
devices due to their firmware. It is possible
to craft such transactions with bcoin, so please
be careful not to do so.

TODO:
- document the other app functions
- Separate tests so that they can more easily run
- document cli usage
- prepackage `trezor.js` post babelified, so that we do not need to include `babel-runtime` as a dependency.
- Handshake support

