# hardwarelib

## bcoin Ledger + Trezor

## Features

- Node.js `Hardware` Class with Ledger and Trezor Support
- CLI tooling for end to end work with `bcoin`
- Pull extended public keys, create watch only wallets/accounts
- Sign transactions, broadcast to the network

TODO:

- Interface
  - createWatchOnly(Hardware, Client, Config)
  
- prepackage `trezor.js` post babelified, so that we do not need to include `babel-runtime` as a dependency.
- CLI multisig support
- Handshake support

