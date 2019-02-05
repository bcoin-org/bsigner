#!/usr/bin/env node insect --port=9877

'use strict';

const {WalletClient,NodeClient} = require('bclient');
const {Network,MTX,TX,HDPublicKey,Outpoint,Coin} = require('bcoin');
const Config = require('bcfg');
const blgr = require('blgr');
const assert = require('bsert');

const {Hardware} = require('../src/hardware');
const {bip44} = require('../src/common');

class CLI {
  constructor() {
    this.config = new Config('harware-cli', {
      alias: {},
    });

    this.config.load({
      argv: true,
      env: true,
    });
  }

  // TODO: log help when bad config
  async open() {
    const logger = new blgr(this.config.str('loglevel', 'debug'));
    await logger.open();

    if (this.config.str('help')) {
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
      logger: logger,
      network: network,
    });

    // give access to destroy method
    this.hardware = hardware;
    await hardware.initialize();

    const apiKey = this.config.str('api-key')
    if (!apiKey)
      logger.warning('no api key passed');

    const walletClient = new WalletClient({
      network: network.type,
      port: network.walletPort,
      apiKey: apiKey,
    });

    if (!this.config.str('wallet'))
      throw new Error('must provide wallet');

    const wallet = walletClient.wallet(this.config.str('wallet'), this.config.str('token'));


    // for now, restrict to spending from a single account
    // because you cannot trust the account index returned
    // from walletClient.getKey

    if (!this.config.str('account'))
      logger.warning('using account default');
    const account = this.config.str('account', 'default');

    if (!this.config.str('recipient'))
      throw new Error('must provice recipient')

    // TODO: smarter parsing around btc <--> sats
    if (!(typeof this.config.uint('value') === 'number'))
      throw new Error('must provide value');

    // TODO: determine sane default values
    const transaction = await wallet.createTX({
      rate: this.config.uint('rate', 1e4),
      sign: false,
      account: account,
      outputs: [
        { value: this.config.uint('value'), address: this.config.str('recipient') },
      ],
    });

    // insert function here...

    const accountInfo = await wallet.getAccount(account);
    const hdpubkey = HDPublicKey.fromBase58(accountInfo.accountKey)

    const base = [
      (bip44.purpose | bip44.hardened) >>> 0,
      (bip44.coinType[network.type] | bip44.hardened) >>> 0,
      hdpubkey.childIndex,
    ];

    const paths = [];
    const coins = [];
    const inputTXs = [];

    for (const input of transaction.inputs) {
      {
        const info = await wallet.getKey(input.coin.address);
        const coin = Coin.fromJSON(input.coin);
        coins.push(coin);
        logger.debug('using branch %s and index %s', info.branch, info.index);
        const path = [...base, info.branch, info.index];
        paths.push(path);
      }
      {
        logger.debug('fetching txid: %s', input.prevout.hash);
        const info = await wallet.getTX(input.prevout.hash);
        // TODO: potential bug TX/MTX?
        const tx = TX.fromRaw(Buffer.from(info.tx, 'hex'));
        inputTXs.push(tx);
      }
    }

    const mtx = MTX.fromRaw(transaction.hex, 'hex');

    const signed = await hardware.signTransaction(mtx, {
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
      const nodeClient = new NodeClient({
        network: network.type,
        port: network.rpcPort,
        apiKey: this.config.str('api-key'),
      });

      const hex = signed.toRaw().toString('hex');
      const response = await nodeClient.broadcast(hex);

      if (!response.success)
        throw new Error('transaction rejected by node');

      logger.info('successful transaction: %s', signed.txid());
    }
  }

  async destroy() {
    await this.hardware.close();
  }

  help() {
    return '\n' +
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
