# hardwarelib

## bcoin Ledger + Trezor

## Features

- Node.js `Hardware` Class with Ledger and Trezor Support
- CLI tooling for end to end work with `bcoin`
- Pull extended public keys, create watch only wallets/accounts
- Sign transactions, broadcast to the network

## Library Usage

```javascript

const {Hardware,Path} = require('libsigner');

(async () => {

  // create bip44 xpub path
  const path = Path.fromList([44,0,0], true);

  const hardware = Hardware.fromOptions({
    vendor: 'ledger',    // supports ledger or trezor
    network: 'regtest',  // main, testnet, regtest, or simnet
  });
  
  const hdpubkey = await hardware.getPublicKey(path);

})().catch(e => {
  console.log(e.stack);
  process.exit(1);
});

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

TODO:
- document the other app functions
- document cli usage
- prepackage `trezor.js` post babelified, so that we do not need to include `babel-runtime` as a dependency.
- Handshake support

