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
 */

class CLI {
  constructor() {
    this.config = new Config('hardwarelib', {
      alias: {
        i: 'index',
        n: 'network',
        v: 'vendor',
        w: 'wallet',
        k: 'apiKey',
        a: 'account',
        u: 'url',
        h: 'httphost',
        p: 'httpport',
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
    this.logger.debug('using network: %s', network.type);

    this.client = new WalletClient({
      network: network.type,
      apiKey: this.config.str('api-key'),
      port: this.config.uint('http-port', network.walletPort),
      host: this.config.str('http-host'),
      url: this.config.str('url'),
      ssl: this.config.bool('ssl'),
    });

    this.wallet = this.client.wallet(this.config.str('wallet'), this.config.str('token'));

    this.hardware = Hardware.fromOptions({
      vendor: this.config.str('vendor'),
      retry: this.config.bool('retry', true),
      network: network.type,
      logger: this.logger.context('hardware'),
    });

    await this.hardware.initialize();

    // create output object
    let out = {
      network: network.type,
      vendor: this.config.str('vendor'),
    };

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
        purpose: this.config.str('purpose', '44h'),
        account: this.config.str('index'),
        // allow for custom coin paths
        coin: this.config.str('coin'),
      });
    }

    out.path = this.path.toString();

    const hdpubkey = await this.hardware.getPublicKey(this.path);

    if (!hdpubkey)
      throw new Error('problem getting public key');

    this.xkey = hdpubkey.xpubkey(network.type);

    out.xkey = this.xkey;
    out.publicKey = hdpubkey.publicKey.toString('hex');

    {
      const receivehdpubkey = hdpubkey.derive(0).derive(0);
      const legacyKeyring = KeyRing.fromPublic(receivehdpubkey.publicKey);
      const segwitKeyring = KeyRing.fromPublic(receivehdpubkey.publicKey);
      segwitKeyring.witness = true;
      let legacy = legacyKeyring.getAddress('base58', network.type);
      let segwit = segwitKeyring.getAddress('string', network.type);

      out.receive = {
        legacy,
        segwit,
      }
    }

    if (this.config.has('create-wallet')) {
      const wallet = this.config.str('wallet');

      const witness = this.config.bool('witness', false);

      const response = await this.client.createWallet(wallet, {
        witness: witness,
        accountKey: this.xkey,
        watchOnly: true,
      });

      out.response = response;
    }

    if (this.config.has('create-account')) {
      const account = this.config.str('account');

      const witness = this.config.bool('witness', false);

      const response = await this.wallet.createAccount(account, {
        witness: witness,
        token: this.config.str('token'),
        accountKey: hdpubkey.xpubkey(network.type),
        watchOnly: true,
      });

      out.wallet = this.config.str('wallet');
      out.response = response;
    }

    console.log(JSON.stringify(out, null, 2));
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
      'pubkeys.js - manage hd public keys with bcoin watch only wallets\n' +
      '  --config               - path to config file\n' +
      '  --log-level            - log level\n' +
      '  --path                 - HD node derivation path\n' +
      '  --index         [-i]   - bip44 account index\n' +
      '  --vendor        [-v]   - key manager, ledger or trezor\n' +
      '  --network       [-n]   - main, testnet, regtest or simnet\n' +
      '  --url           [-u]   - wallet node url\n' +
      '  --ssl           [-s]   - connect to wallet node over ssl\n' +
      '  --http-host     [-h]   - wallet node http host\n' +
      '  --http-port     [-p]   - wallet node http port\n' +
      '  --create-wallet        - create bcoin wallet using derived pubkey\n' +
      '    --wallet      [-w]   - name of wallet to create\n' +
      '    --api-key     [-a]   - optional bcoin api key\n' +
      '  --create-account       - create bcoin account using derived pubkey\n' +
      '    --wallet      [-w]   - name of wallet to create account in\n' +
      '    --account     [-a]   - name of account to create\n' +
      '    --api-key     [-k]   - optional bcoin api key\n' +
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
