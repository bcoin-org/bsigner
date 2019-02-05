#!/usr/bin/env node

'use strict';

const Config = require('bcfg');
const {Network,TX,MTX} = require('bcoin');
const MultisigClient = require('bmultisig/lib/client');
const blgr = require('blgr');
const assert = require('bsert');
const {WalletClient} = require('bclient');

const {HDAccountKeyPath,HDAccountKeyString} = require('../src/common');
const {Hardware} = require('../src/hardware');
const {prepareSign} = require('../src/app');

/*
 * TODO: if this.config is mutated, then things will break
 */

class CLI {
  constructor() {
    this.config = new Config('harwarelib', {
      alias: {},
    });

    this.config.load({
      argv: true,
      env: true,
    });

    if (this.config.str('config'))
      this.config.open(this.config.path('config'));
  }

  async open() {
    const logger = new blgr(this.config.str('loglevel', 'debug'));
    await logger.open();
    this.logger = logger;

    if (this.config.str('help')) {
      logger.info(this.help());
      process.exit(0);
    }

    const [valid, msg] = this.validateConfig();
    if (!valid) {
      logger.error(this.help(msg));
      process.exit(1);
    }

    const vendor = this.config.str('vendor');
    const network = Network.get(this.config.str('network'));

    const hardware = Hardware.fromOptions({
      vendor: vendor,
      retry: this.config.bool('retry', true),
      logger: logger,
      network: network,
    });

    this.hardware = hardware;
    await hardware.initialize();

    const multisigClient = new MultisigClient({
      network: network.type,
      port: network.walletPort,
      apiKey: this.config.str('api-key'),
      token: this.config.str('token'),
    });

    const walletClient = new WalletClient({
      network: network.type,
      port: network.walletPort,
      apiKey: this.config.str('api-key'),
    });

    const path = HDAccountKeyPath(this.config.uint('index'), network, {
      hardened: true
    });

    const wallet = this.config.str('wallet');

    if (this.config.str('get-info')) {
      const wallet = multisigClient.wallet(this.config.str('wallet'), this.config.str('token'))
      const info = await wallet.getInfo(true);

      this.logger.info('wallet id: %s', info.id);
      this.logger.info('initialized: %s', info.initialized);
      if (info.initialized) {
        this.logger.info('receive address: %s', info.account.receiveAddress);
        this.logger.info('balance: %s', info.account.balance.confirmed);
      }
      process.exit(0);
    }

    if (this.config.bool('create-wallet')) {

      // TODO: remove this debug statement
      // and place the formatted one inside of the hardware class
      logger.debug('using path %s', 'm\'/' + path.join('/'));
      const hdpubkey = await hardware.getPublicKey(path);

      const response = await multisigClient.createWallet(wallet, {
        witness: this.config.bool('segwit', false),
        xpub: hdpubkey.xpubkey(network.type),
        watchOnly: true,
        m: this.config.uint('m'),
        n: this.config.uint('n'),
        cosignerName: this.config.str('cosigner-name'),
        path: '',
      });

      logger.info('wallet created: %s - %s of %s', response.id, response.m, response.n);
      logger.info('join key: %s', response.joinKey);

      const cosigner = response.cosigners.find(c => c.name === this.config.str('cosigner-name'));
      logger.info('cosigner name/token: %s/%s', cosigner.name, cosigner.token);

      // allow for create/join in one operation
      // use global variables instead
      if (!this.config.str('join-key'))
        this.config.set('join-key', response.joinKey);
      if (!this.config.str('token'))
        this.config.set('token', cosigner.token);
    }

    if (this.config.bool('join-wallet')) {

      const hdpubkey = await hardware.getPublicKey(path);

      const join = await multisigClient.joinWallet(wallet, {
        cosignerName: this.config.str('cosigner-name'),
        cosignerPath: '',
        joinKey: this.config.str('join-key'),
        xpub: hdpubkey.xpubkey(network.type),
      });

      this.logger.info('wallet joined: %s - initialized: %s', join.id, join.initialized);
      const cosigner = join.cosigners.find(c => c.name === this.config.str('cosigner-name'));
      this.logger.info('cosigner name/token: %s/%s', cosigner.name, cosigner.token);
    }

    // TODO: define the client once at the beginning of the script
    let client;

    if (this.config.str('create-proposal')) {
      client = multisigClient.wallet(this.config.str('wallet'), this.config.str('token'));

      const proposal = await client.createProposal({
        memo: this.config.str('memo'),
        cosigner: this.config.str('cosigner-id'),
        rate: this.config.uint('rate', 1e3),
        sign: false,
        account: this.config.str('account', 'default'),
        outputs: [
          {
            value: this.config.uint('value'),
            address: this.config.str('recipient'),
          },
        ],
      });

      this.logger.info('proposal id: %s', proposal.id);
      this.logger.info('%s', proposal.statusMessage);
    }

    if (this.config.str('get-proposals')) {
      client = multisigClient.wallet(this.config.str('wallet'), this.config.str('token'));
      const proposals = await client.getProposals(true);

      if (!proposals || proposals.length === 0) {
        this.logger.info('no proposals found');
        process.exit();
      }

      for (const proposal of proposals)
        this.logger.info('\n%o', proposal);
    }

    if (this.config.str('approve-proposal')) {
      client = multisigClient.wallet(this.config.str('wallet'), this.config.str('token'));

      // pid, signatures, broadcast
      const pid = this.config.str('proposal-id');
      // build signature
      const ptx = await client.getProposalMTX(pid, {
        path: true,
        txs: true,
        scripts: true,
      });

      // use this to parse the bip44 account index
      const hdpubkey = await hardware.getPublicKey(path);

      const wallet = walletClient.wallet(this.config.str('wallet'), this.config.str('token'));

      const mtx = MTX.fromRaw(Buffer.from(ptx.tx.hex, 'hex'));

      // TEMP: remove hdpubkey from fn signature when fix is merged into bcoin
      const { paths, coins, inputTXs } = await prepareSign(multisigClient, hdpubkey, ptx.tx, this.config);
      const scripts = ptx.scripts;

      const signed = await hardware.signTransaction(mtx, {
        paths,
        inputTXs,
        coins,
        scripts,
      });

      if (!signed)
        throw new Error('problem signing transaction');

      const raw = signed.toRaw().toString('hex');


      const approval = await client.approveProposal(pid, [raw], this.config.bool('broadcase', true));

      console.log(approval);

    }


    // options:
    // create multisig wallet  - done
    // join multisig wallet    - done
    // get info                - done
    // create proposal         - done
    // approve proposal
    // reject proposal
    // get proposal info
    //
    // create transaction      -
  }

  // TODO:
  destroy() {

  }

  /*
   * Checks that each required config
   * option is present
   * @returns {Boolean}
   */
  validateConfig() {
    let msg = '';
    let valid = true;

    if (this.config.str('get-info'))
      return [valid, msg];

    if (this.config.str('get-proposals'))
      return [valid, msg];

    if (!this.config.str('vendor')) {
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

    if (!this.config.str('api-key'))
      this.logger.debug('no api key passed');
    if (!this.config.str('token'))
      this.logger.debug('no token passed');

    if (!this.config.str('wallet')) {
      msg += 'must provide wallet\n';
      valid = false;
    }

    // create wallet required config
    if (this.config.str('create-wallet')) {
      const m = this.config.uint('m');
      const n = this.config.uint('n');

      if (!m || !n) {
        msg += 'must pass m and n\n';
        valid = false;
      }

      if (!this.config.str('cosigner-name')) {
        msg += 'must pass cosigner name\n';
        valid = false;
      }
    }

    if (this.config.str('join-wallet')) {
      if (!this.config.str('join-key')) {
        msg += 'must pass join key\n';
        valid = false;
      }
      if (!this.config.str('wallet')) {
        msg += 'must pass wallet\n';
        valid = false;
      }
    }

    if (this.config.str('create-proposal')) {
      if (!this.config.str('memo')) {
        msg += 'must pass memo\n';
        valid = false;
      }

      if (!this.config.uint('value')) {
        msg += 'must pass value\n';
        valid = false;
      }

      if (!this.config.str('recipient')) {
        msg += 'must pass recipient\n';
        valid = false;
      }

      if (!this.config.str('token')) {
        msg += 'must pass token\n';
        valid = false;
      }
    }

    if (this.config.str('approve-proposal')) {
      if (!this.config.str('proposal-id')) {
        msg += 'must pass proposal id\n';
        valid = false;
      }
    }

    // need index when secret generated client side
    // for create proposal
    if (!this.config.str('path')) {
      if (typeof this.config.uint('index') !== 'number') {
        msg += 'must pass index\n';
        valid = false;
      }
    }


    if (!valid)
      msg = 'Invalid config\n' + msg;

    return [valid, msg];
  }

  help(msg = '') {
    return msg +'\n' +
      'sign.js - sign transactions using trezor and ledger\n' +
      '  --create-wallet\n' +
      '  --'
  }
}

(async () => {
  const cli = new CLI();
  await cli.open();
  await cli.destroy();
})().catch(e => {
  console.error(e.stack);
  process.exit(1);
});

