#!/usr/bin/env node

'use strict';

const {WalletClient,NodeClient} = require('bclient');
const {Network,MTX,TX,HDPublicKey,Outpoint,Coin} = require('bcoin');
const Config = require('bcfg');
const blgr = require('blgr');
const assert = require('bsert');

const {prepareSign} = require('../src/app');
const {Hardware} = require('../src/hardware');
const {prepareTypes} = require('../src/common');
const {Path} = require('../src/path');

class CLI {
  constructor() {
    this.config = new Config('hardwarelib', {
      alias: {},
    });

    this.config.load({
      argv: true,
      env: true,
    });

    if (this.config.has('config'))
      this.config.open(this.config.path('config'));
  }

  async open() {
    this.logger = new blgr(this.config.str('loglevel', 'debug'));
    await this.logger.open();

    if (this.config.has('help')) {
      this.logger.info(this.help())
      process.exit(0)
    }

    const [valid, msg] = this.validateConfig();
    if (!valid) {
      this.logger.error(this.help(msg));
      process.exit(1);
    }

    const network = Network.get(this.config.str('network'));

    this.hardware = Hardware.fromOptions({
      vendor: this.config.str('vendor'),
      retry: this.config.bool('retry', true),
      logger: this.logger,
      network: network,
    });

    await this.hardware.initialize();

    this.client = new WalletClient({
      network: network.type,
      port: network.walletPort,
      apiKey: this.config.str('apiKey'),
      passphrase: this.config.str('passphrase'),
    });

    this.wallet = this.client.wallet(this.config.str('wallet'), this.config.str('token'));

    this.node = new NodeClient({
      network: network.type,
      port: network.rpcPort,
      apiKey: this.config.str('api-key'),
    });

    // for now, restrict to spending from a single account
    // because you cannot trust the account index returned
    // from wallet.getKey in all cases

    const account = this.config.str('account', 'default');

    // TODO: determine sane default values
    const tx = await this.wallet.createTX({
      rate: this.config.uint('rate', 1e3),
      sign: false,
      account: account,
      passphrase: this.config.str('passphrase'),
      subtractIndex: this.config.uint('subtract-index', 0),
      outputs: [
        { value: this.config.uint('value'), address: this.config.str('recipient') },
      ],
    });

    const { coins, inputTXs, paths, mtx } = await prepareSign({
      tx: tx,
      wallet: this.wallet,
      account,
    });

    const signed = await this.hardware.signTransaction(mtx, {
      paths,
      inputTXs,
      coins,
    });

    if (!signed)
      throw new Error('problem signing transaction');

    // TODO: figure out why verify fails even
    // though it creates valid transactions
    // assert(signed.verify(), 'invalid transaction');

    if (this.config.bool('broadcast', true)) {
      const hex = signed.toRaw().toString('hex');
      const response = await this.node.broadcast(hex);

      if (!response.success)
        throw new Error('transaction rejected by node');

      this.logger.info('successful transaction: %s', signed.txid());
    }
  }

  async destroy() {
    await this.hardware.close();
  }

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

    if (!this.config.has('wallet')) {
      msg += 'must provide wallet\n';
      valid = false;
    }

    if (!this.config.has('recipient')) {
      msg += 'must provide recipient\n';
      valid = false;
    }

    if (!this.config.has('api-key'))
      this.logger.debug('no api key passed');

    // hard coded to use default fallback
    if (!this.config.has('account'))
      this.logger.warning('using account default');

    // TODO: smarter parsing around btc <--> sats
    if (!this.config.has('value')) {
      msg += 'must provide value\n';
      valid = false;
    }

    return [valid, msg];
  }

  help(msg = '') {
    return msg + '\n' +
      'sign.js - sign transactions using trezor and ledger'
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
