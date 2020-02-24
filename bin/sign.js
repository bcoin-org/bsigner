#!/usr/bin/env node

'use strict';

const {WalletClient,NodeClient} = require('bclient');
const {Network} = require('bcoin');
const Config = require('bcfg');
const Logger = require('blgr');
const assert = require('bsert');

const {prepareSign} = require('../lib/app');
const DeviceManager = require('../lib/manager/manager');

class CLI {
  constructor() {
    this.config = new Config('hardwarelib', {
      alias: {
        n: 'network',
        v: 'vendor',
        w: 'wallet',
        r: 'recipient',
        k: 'apiKey',
        a: 'account',
        h: 'httphost',
        p: 'httpport',
        s: 'ssl',
        uri: 'url'
      }
    });

    this.manager = null;
    this.logger = Logger.global;

    this.config.load({
      argv: true,
      env: true
    });

    if (this.config.has('config'))
      this.config.open(this.config.path('config'));
  }

  async open() {
    this.logger = new Logger(this.config.str('loglevel', 'info'));
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
    const vendor = this.config.str('vendor');

    this.manager = DeviceManager.fromOptions({
      logger: this.logger,
      network: network,
      vendor: vendor
    });

    await this.manager.open();
    await this.manager.selectDevice(vendor.toUpperCase());

    /*
     * TODO: way to specify arbitrary
     * remote wallet and node at
     * different hosts
     */

    this.client = new WalletClient({
      network: network.type,
      port: network.walletPort,
      apiKey: this.config.str('apiKey'),
      passphrase: this.config.str('passphrase')
    });

    this.wallet = this.client.wallet(
      this.config.str('wallet'), this.config.str('token'));

    this.node = new NodeClient({
      network: network.type,
      port: network.rpcPort,
      apiKey: this.config.str('api-key'),
      host: this.config.str('http-host'),
      url: this.config.str('url'),
      ssl: this.config.bool('ssl')
    });

    // create output object
    const out = {
      vendor: this.config.str('vendor'),
      network: network.type,
      wallet: this.config.str('wallet')
    };

    // for now, restrict to spending from a single account
    // because you cannot trust the account index returned
    // from wallet.getKey in all cases
    const account = this.config.str('account', 'default');
    out.account = account;

    const tx = await this.wallet.createTX({
      rate: this.config.uint('rate', 1e3),
      sign: false,
      account: account,
      passphrase: this.config.str('passphrase'),
      subtractIndex: this.config.uint('subtract-index', 0),
      outputs: [
        {
          value: this.config.uint('value'),
          address: this.config.str('recipient')
        }
      ]
    });

    const {mtx, inputData} = await prepareSign({
      tx: tx,
      wallet: this.wallet,
      account,
      network: network
    });

    const signed = await this.manager.signTransaction(mtx, inputData);

    if (!signed)
      throw new Error('problem signing transaction');

    assert(signed.verify(), 'invalid transaction');
    out.valid = true;

    out.broadcast = this.config.bool('broadcast', true);
    if (this.config.bool('broadcast', true)) {
      const hex = signed.toRaw().toString('hex');
      out.hex = hex;
      const response = await this.node.broadcast(hex);

      if (!response.success)
        throw new Error('transaction rejected by node');

      out.response = response;
    }

    console.log(JSON.stringify(out, null, 2));
  }

  async destroy() {
    await this.manager.close();
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
      msg += `invalid network: ${network}\n`;
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
      this.logger.debug('using account default');

    // TODO: smarter parsing around btc <--> sats
    if (!this.config.has('value')) {
      msg += 'must provide value\n';
      valid = false;
    }

    return [valid, msg];
  }

  help(msg = '') {
    return String(msg + '\n' +
      'sign.js - sign transactions using trezor and ledger\n' +
      '  --network     [-n]            - one of main,testnet,regtest,simnet\n' +
      '  --vendor      [-v]            - signing vendor to use\n' +
      '  --wallet      [-w]            - bcoin wallet id to use\n' +
      '  --account     [-a] (=default) - bcoin account id to use\n' +
      '  --recipient   [-r]            - bitcoin address to spend to\n' +
      '  --value                       - value in transaction output\n' +
      '  --apiKey      [-k]            - bclient api key\n' +
      '  --passphrase                  - wallet passphrase\n' +
      '  --url         [-u]            - wallet node url\n' +
      '  --ssl         [-s]            - connect to wallet node over ssl\n' +
      '  --http-host   [-h]            - wallet node http host\n' +
      '  --http-port   [-p]            - wallet node http port\n' +
      '  --log-level                   - log level\n' +
      '  --config                      - path to config file\n');
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
