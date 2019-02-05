#!/usr/bin/env node

'use strict';

const {Network,KeyRing} = require('bcoin');
const {WalletClient} = require('bclient');
const Config = require('bcfg');
const blgr = require('blgr');

const {Hardware} = require('../src/hardware');
const {bip44} = require('../src/common');

// TODO: is there a way to specifiy
// required using bcfg?

/*
 * extract public keys and make wallets/accounts
 * TODO
 * - add multisig support
 * - document cli flags
 * - don't throw error for not providing api-key
 * - add retoken
 *
 */

class CLI {
  constructor() {
    // TODO: think about good alias usage
    this.config = new Config('hardwarelib', {
      alias: {
        'v': 'vendor',
        'n': 'network',
        'u': 'url',
        'k': 'api-key',
        's': 'ssl',
        'h': 'httphost',
        'p': 'httpport',
        'w': 'wallet',
        'a': 'account',
        'h': 'help',
      },
    });

    this.config.load({
      argv: true,
      env: true,
    });

    if (this.config.str('config'))
      this.config.open(this.config.str('config'));
  }

  async open() {
    const logger = new blgr(this.config.str('loglevel', 'debug'));
    await logger.open();

    if (this.config.str('help', '')) {
      logger.info(this.help())
      process.exit(0)
    }

    const vendor = this.config.str('vendor');
    if (!vendor)
      throw new Error('must provide vendor');

    let network = this.config.str('network');
    if (network)
      network = Network.get(network);
    else
      throw new Error('must pass network');

    const hardware = Hardware.fromOptions({
      vendor: vendor,
      retry: this.config.bool('retry', true),
      network: network,
      logger: logger,
    });

    // give access to destroy method
    this.hardware = hardware;
    await hardware.initialize();

    let path = this.config.str('path');

    if (!path) {
      const index = this.config.uint('index');

      if (typeof index !== 'number')
        throw new Error('must provide index when no path provided');

      if (!network)
        throw new Error('must provide network when no path provided');

      const coinType = bip44.coinType[network.type];
      logger.info('assuming bip44, using %s\'/%s\'/%s\'', bip44.purpose, coinType, index)

      path = [
        (bip44.purpose | bip44.hardened) >>> 0,
        (coinType | bip44.hardened) >>> 0,
        (index | bip44.hardened) >>> 0,
      ];
    }

    const hdpubkey = await hardware.getPublicKey(path);

    if (!hdpubkey)
      throw new Error('problem getting public key');

    if (network)
      logger.info('extended public key:\n       %s', hdpubkey.xpubkey(network.type));

    logger.info('hex public key:\n       %s', hdpubkey.publicKey.toString('hex'));

    {
      const receivehdpubkey = hdpubkey.derive(0).derive(0);
      const legacyKeyring = KeyRing.fromPublic(receivehdpubkey.publicKey);
      const segwitKeyring = KeyRing.fromPublic(receivehdpubkey.publicKey);
      segwitKeyring.witness = true;
      let legacy = legacyKeyring.getAddress('base58', network.type);
      let segwit = segwitKeyring.getAddress('string', network.type);

      logger.info('legacy receive address:\n       %s', legacy);
      logger.info('segwit receive address:\n       %s', segwit);
    }

    if (this.config.bool('create-wallet', false)) {
      const wallet = this.config.str('wallet');

      if (!wallet)
        throw new Error('must provide wallet name when creating wallet');

      // use network to get ports
      if (!network)
        throw new Error('must provide network when creating wallet');

      const apiKey = this.config.str('api-key')
      if (!apiKey)
        throw new Error('must pass api key');

      const client = new WalletClient({
        network: network.type,
        port: network.walletPort,
        apiKey: apiKey,
      })

      const witness = this.config.bool('segwit', false);

      if (witness)
        logger.info('creating segwit wallet');

      const response = await client.createWallet(wallet, {
        witness: witness,
        accountKey: hdpubkey.xpubkey(network.type),
        watchOnly: true,
      });

      const receivehdpubkey = hdpubkey.derive(0).derive(0);
      const keyring = KeyRing.fromPublic(receivehdpubkey.publicKey);

      logger.info('success: created wallet %s', response.id);
      logger.info('token: %s', response.token);
    }

    if (this.config.bool('create-account', false)) {
      const wallet = this.config.str('wallet');
      const account = this.config.str('account');

      if (!wallet || !account)
        throw new Error('must provide wallet and account when creating account');

      const client = new WalletClient({
        network: network.type,
        port: network.walletPort,
        apiKey: this.config.str('api-key'),
      });

      let token = this.config.str('token');
      if (!token)
        throw new Error('need wallet token to create account');

      const response = await client.createAccount(wallet, account, {
        witness: this.config.bool('witness', false),
        token: token,
        accountKey: hdpubkey.xpubkey(network.type),
        watchOnly: true,
      });

      logger.info('success: created account %s in wallet %s', response.name, wallet);
      logger.info('receive address: %s', response.receiveAddress);
    }
  }

  async destroy() {
    await this.hardware.close();
  }

  // TODO: finish and document
  help() {
    return '\n' +
      'pubkeys.js - manage hd public keys using ledger or trezor' +
      '\n' +
      '  --path\n' +
      '  --index\n' +
      '  --create-wallet\n' +
      '  --create-account\n'
  }
}

(async () => {
  const cli = new CLI();
  await cli.open();
  await cli.destroy();
})().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
