# hardwarelib

## bcoin Ledger + Trezor

## Features

- Node.js `Hardware` Class with Ledger and Trezor Support
- CLI tooling for end to end work with `bcoin`
- Pull extended public keys, create watch only wallets/accounts
- Sign transactions, broadcast to the network

## Usage

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

TODO:
- document the other app functions
- document cli usage
- prepackage `trezor.js` post babelified, so that we do not need to include `babel-runtime` as a dependency.
- Handshake support

