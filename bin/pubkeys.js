#!/usr/bin/env node

'use strict';

const {Network,KeyRing} = require('bcoin');
const {WalletClient} = require('bclient');
const Config = require('bcfg');
const blgr = require('blgr');

const {Hardware} = require('../src/hardware');
const {bip44} = require('../src/common');
const {Path} = require('../src/path');

/*
 * extract public keys and make wallets/accounts
 * TODO:
 * - document all cli flags
 * - add retoken
 * - make client work against remote servers
 */

class CLI {
  constructor() {
    // TODO: think about good alias usage
    this.config = new Config('hardwarelib', {
      alias: {
        h: 'help',
        i: 'index',
      },
    });

    this.config.load({
      argv: true,
      env: true,
    });

    if (this.config.has('config'))
      this.config.open(this.config.path('config'));
  }

  async open() {
    this.logger = new blgr(this.config.str('loglevel', 'info'));
    await this.logger.open();

    if (this.config.has('help')) {
      this.logger.info(this.help());
      process.exit(0);
    }

    const [valid, msg] = this.validateConfig();
    if (!valid) {
      this.logger.error(this.help(msg));
      process.exit(1);
    }

    const network = Network.get(this.config.str('network'));

    this.client = new WalletClient({
      network: network.type,
      port: network.walletPort,
      apiKey: this.config.str('api-key'),
    });

    this.wallet = this.client.wallet(this.config.str('wallet'), this.config.str('token'));

    this.hardware = Hardware.fromOptions({
      vendor: this.config.str('vendor'),
      retry: this.config.bool('retry', true),
      network: network.type,
      logger: this.logger.context('hardware'),
    });

    await this.hardware.initialize();

    if (this.config.has('path'))
      this.path = Path.fromString(this.config.str('path'));
    else {
      // auto increment account creation
      if (this.config.has('create-account') && !this.config.has('index')) {
        const info = await this.wallet.getInfo();
        if (!info)
          throw new Error('problem fetching wallet info');
        this.config.set('index', info.accountDepth);
      }
      this.path = Path.fromOptions({
        network: network.type,
        purpose: this.config.uint('purpose', 44),
        account: this.config.uint('index', 0),
        // allow for custom coin paths
        coin: this.config.uint('coin'),
      });
    }

    this.logger.info('using path: %s', this.path);

    const hdpubkey = await this.hardware.getPublicKey(this.path);

    if (!hdpubkey)
      throw new Error('problem getting public key');

    this.logger.info('extended public key:\n       %s', hdpubkey.xpubkey(network.type));
    this.logger.debug('hex public key:\n       %s', hdpubkey.publicKey.toString('hex'));

    {
      const receivehdpubkey = hdpubkey.derive(0).derive(0);
      const legacyKeyring = KeyRing.fromPublic(receivehdpubkey.publicKey);
      const segwitKeyring = KeyRing.fromPublic(receivehdpubkey.publicKey);
      segwitKeyring.witness = true;
      let legacy = legacyKeyring.getAddress('base58', network.type);
      let segwit = segwitKeyring.getAddress('string', network.type);

      this.logger.info('legacy receive address:\n       %s', legacy);
      this.logger.info('segwit receive address:\n       %s', segwit);
    }

    if (this.config.has('create-wallet')) {
      const wallet = this.config.str('wallet');

      const response = await this.client.createWallet(wallet, {
        witness: this.config.bool('witness', false),
        accountKey: hdpubkey.xpubkey(network.type),
        watchOnly: true,
      });

      this.logger.info('success: created wallet %s', response.id);
      this.logger.info('token: %s', response.token);
    }

    if (this.config.has('create-account')) {
      const account = this.config.str('account');

      const response = await this.wallet.createAccount(account, {
        witness: this.config.bool('witness', false),
        token: this.config.str('token'),
        accountKey: hdpubkey.xpubkey(network.type),
        watchOnly: true,
      });

      this.logger.info('success: created account %s in wallet %s', response.name, this.config.str('wallet'));
    }
  }

  async destroy() {
    await this.hardware.close();
  }

  // TODO: this could be easier to manage as an iterator
  // with a switch statement
  validateConfig() {
    let msg = '';
    let valid = true;

    if (!this.config.has('vendor')) {
      msg += 'must provide vendor\n';
      valid = false;
    }

    const network = this.config.str('network');
    if (!network) {
      msg += 'must provide network\n';
      valid = false;
    }

    if (!['main', 'testnet', 'regtest', 'simnet'].includes(network)) {
      msg += `invalid network: ${network}\n`
      valid = false;
    }

    if (!this.config.has('path')) {
      // gross...
      // will auto increment to create the next account
      // if not index is passed
      // create-account does not require an index
      if (!this.config.has('create-account')) {
        if (!this.config.has('index')) {
          msg += 'must pass index\n';
          valid = false;
        }
      }
    }

    if (this.config.has('create-wallet')) {
      if (!this.config.has('wallet')) {
        msg += 'must pass wallet\n';
        valid = false;
      }
      if (!this.config.has('api-key'))
        this.logger.debug('no api key passed');
    }

    if (this.config.has('create-account')) {
      if (!this.config.has('wallet')) {
        msg += 'must pass wallet\n';
        valid = false;
      }

      if (!this.config.has('account')) {
        msg += 'must pass account\n';
        valid = false;
      }

      if (!this.config.has('token'))
        this.logger.debug('no token passed');
    }

    return [valid, msg];
  }

  // TODO: finish and document
  help(msg = '') {
    return msg + '\n' +
      'pubkeys.js - manage hd public keys using ledger or trezor' +
      '\n' +
      '  --path                - HD node derivation path\n' +
      '  --index               - bip44 account index\n' +
      '  --vendor              - key manager, ledger or trezor\n' +
      '  --network             - main, testnet, regtest or simnet\n' +
      '  --create-wallet       - create bcoin wallet using derived pubkey\n' +
      '    --wallet            - name of wallet to create\n' +
      '    --api-key           - optional bcoin api key\n' +
      '  --create-account      - create bcoin account using derived pubkey\n' +
      '    --wallet            - name of wallet to create account in\n' +
      '    --account           - name of account to create\n' +
      '    --api-key           - optional bcoin api key\n' +
      '';
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
