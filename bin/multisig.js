#!/usr/bin/env node

'use strict';

const Config = require('bcfg');
const {Network} = require('bcoin');
const {MultisigClient} = require('bmultisig-client');
const Logger = require('blgr');

const {Path} = require('../src/path');
const {Hardware} = require('../src/hardware');
const {prepareSignMultisig,generateToken,guessPath} = require('../src/app');

/*
 * Manage Multisig wallets with bcoin and watch only wallets
 *
 */

class CLI {
  constructor() {
    this.config = new Config('harwarelib', {
      alias: {
        n: 'network',
        v: 'vendor',
        w: 'wallet',
        i: 'index',
        c: 'cosignername',
        j: 'joinkey'
      }
    });

    this.config.load({
      argv: true,
      env: true
    });

    if (this.config.str('config'))
      this.config.open(this.config.path('config'));
  }

  async open() {
    this.logger = new Logger(this.config.str('loglevel', 'debug'));
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

    this.client = new MultisigClient({
      network: network.type,
      port: network.walletPort,
      apiKey: this.config.str('api-key')
    });

    this.wallet = this.client.wallet(
      this.config.str('wallet'), this.config.str('token'));

    if (this.config.has('path'))
      this.path = Path.fromString(this.config.str('path'));
    else if (this.config.has('index'))
      this.path = Path.fromOptions({
        network: network.type,
        purpose: this.config.str('purpose', '44h'),
        account: this.config.str('index'),
        // allow for custom coin paths
        coin: this.config.uint('coin')
      });

    // create output object
    const out = {
      message: '',
      path: this.path ? this.path.toString() : null,
      vendor: this.config.str('vendor'),
      network: network.type
    };

    /*
     * get multisig wallet info
     */
    if (this.config.has('get-info')) {
      const walletInfo = await this.wallet.getInfo(true);
      if (!walletInfo)
        throw new Error('could not fetch wallet info');
      const accountInfo = await this.wallet.getAccount('default');
      if (!accountInfo)
        throw new Error('could not fetch account info');

      out.reponse = {
        wallet: walletInfo,
        account: accountInfo
      };
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    /*
     * get proposals
     */
    if (this.config.has('get-proposals')) {
      const proposals = await this.wallet.getProposals(true);

      out.response = proposals;
      console.log(JSON.stringify(out, null, 2));
      process.exit();
    }

    /*
     * initialize hardware
     */
    this.hardware = Hardware.fromOptions({
      vendor: this.config.str('vendor'),
      retry: this.config.bool('retry', true),
      network: network,
      logger: this.logger.context('hardware')
    });

    await this.hardware.initialize();

    /*
     * create multisig wallet
     */
    if (this.config.has('create-wallet')) {
      const cosignerToken = await generateToken(this.hardware, this.path);

      const hdpubkey = await this.hardware.getPublicKey(this.path);

      // token in POST body will not overwrite client token
      const wallet = this.config.str('wallet');
      const response = await this.client.createWallet(wallet, {
        witness: this.config.bool('segwit', false),
        accountKey: hdpubkey.xpubkey(network.type),
        watchOnly: true,
        m: this.config.uint('m'),
        n: this.config.uint('n'),
        cosignerName: this.config.str('cosigner-name'),
        cosignerPath: this.path.toString(),
        token: cosignerToken.toString('hex')
      });

      out.path = this.path.toString();
      out.response = response;

      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (this.config.has('join-wallet')) {
      const hdpubkey = await this.hardware.getPublicKey(this.path.toList());
      const cosignerToken = await generateToken(this.hardware, this.path);

      const wallet = this.config.str('wallet');

      const response = await this.client.joinWallet(wallet, {
        cosignerName: this.config.str('cosigner-name'),
        cosignerPath: this.path.toString(),
        joinKey: this.config.str('join-key'),
        accountKey: hdpubkey.xpubkey(network.type),
        token: cosignerToken.toString('hex')
      });

      out.response = response;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    /*
     * create proposal
     * needs account index to create cosigner token
     */
    if (this.config.has('create-proposal')) {
      // const hdpubkey = await this.hardware.getPublicKey(
      // this.path.toString());
      const cosignerToken = await generateToken(this.hardware, this.path);

      const wallet = this.client.wallet(
        this.config.str('wallet'), cosignerToken.toString('hex'));
      const proposal = await wallet.createProposal({
        memo: this.config.str('memo'),
        cosigner: this.config.str('cosigner-id'),
        rate: this.config.uint('rate', 1e3),
        sign: false,
        account: this.config.str('account', 'default'),
        outputs: [
          {
            value: this.config.uint('value'),
            address: this.config.str('recipient')
          }
        ]
      });

      out.response = proposal;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (this.config.has('approve-proposal')) {
      const pid = this.config.uint('proposal-id');
      // response is {tx,paths,scripts,txs}
      const pmtx = await this.wallet.getProposalMTX(pid, {
        paths: true,
        scripts: true,
        txs: true
      });

      if (!pmtx)
        throw new Error('make sure there is a proposal first');

      if (!pmtx.tx)
        throw new Error('no proposal to approve');

      /*
       * if no path explicitly
       * passed, use the guessed path
       */
      if (!this.path)
        this.path = await guessPath(this.hardware, this.wallet, network);

      const {paths,inputTXs,coins,scripts,mtx} = await prepareSignMultisig({
        pmtx,
        path: this.path,
      });

      const signatures = await this.hardware.getSignature(mtx, {
        paths,
        inputTXs,
        coins,
        scripts,
        enc: 'hex'
      });

      if (!signatures)
        throw new Error('problem signing transaction');

      const cosignerToken = await generateToken(this.hardware, this.path);
      const wallet = this.client.wallet(this.config.str('wallet'),
        cosignerToken.toString('hex'));

      const approval = await wallet.approveProposal(pid, signatures,
        this.config.bool('broadcase', true));

      out.response = approval;
      out.path = this.path;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (this.config.str('reject-proposal')) {
      const cosignerToken = await generateToken(this.hardware, this.path);

      const wallet = this.client.wallet(this.config.str('wallet'),
        cosignerToken.toString('hex'));
      const rejection = await wallet.rejectProposal(
        this.config.uint('proposal-id'));

      out.response = rejection;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
  }

  async destroy() {
    await this.hardware.close();
  }

  /*
   * Checks that each required config
   * option is present
   * @returns {[]Boolean, String}
   */
  validateConfig() {
    let msg = '';
    let valid = true;

    if (this.config.has('get-info'))
      return [valid, msg];

    if (this.config.has('get-proposals'))
      return [valid, msg];

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

    // TODO: this may need a refactor
    if (!this.config.has('api-key'))
      this.logger.debug('no api key passed');
    if (!this.config.has('token'))
      this.logger.debug('no token passed');

    if (!this.config.has('wallet')) {
      msg += 'must provide wallet\n';
      valid = false;
    }

    // create wallet required config
    if (this.config.has('create-wallet')) {
      const m = this.config.uint('m');
      const n = this.config.uint('n');

      if (!m || !n) {
        msg += 'must pass m and n\n';
        valid = false;
      }

      if (!this.config.has('cosigner-name')) {
        msg += 'must pass cosigner name\n';
        valid = false;
      }

      if (!this.config.has('index') && !this.config.has('path')) {
        msg += 'must pass index or path\n';
        valid = false;
      }
    }

    if (this.config.has('join-wallet')) {
      if (!this.config.str('join-key')) {
        msg += 'must pass join key\n';
        valid = false;
      }
      if (!this.config.has('wallet')) {
        msg += 'must pass wallet\n';
        valid = false;
      }
      if (!this.config.has('cosigner-name')) {
        msg += 'must pass cosigner name\n';
        valid = false;
      }
    }

    if (this.config.has('create-proposal')) {
      if (!this.config.str('memo')) {
        msg += 'must pass memo\n';
        valid = false;
      }

      if (!this.config.has('value')) {
        msg += 'must pass value\n';
        valid = false;
      }

      if (!this.config.has('recipient')) {
        msg += 'must pass recipient\n';
        valid = false;
      }
    }

    if (this.config.str('approve-proposal')) {
      if (!this.config.str('proposal-id')) {
        msg += 'must pass proposal id\n';
        valid = false;
      }
    }

    // ugh
    if (!this.config.has('path')) {
      if (!this.config.has('index')) {
        if (this.config.has('create-proposal')) {
          msg += 'must pass index\n';
          valid = false;
        }
      }
    }

    if (!valid)
      msg = 'Invalid config\n' + msg;

    return [valid, msg];
  }

  help(msg = '') {
    return String(msg +'\n' +
      'multisig.js - manage multisig transactions using trezor and ledger\n' +
      '  --vendor          [-v]   - ledger or trezor\n' +
      '  --network         [-n]   - ledger or trezor\n' +
      '  --get-info               - get multisig wallet info\n' +
      '    --wallet        [-w]   - wallet id\n' +
      '    --token                - authentication token\n' +
      '  --get-proposals\n'+
      '    --wallet        [-w]   - wallet id\n' +
      '  --create-wallet          - create multisig wallet\n' +
      '    --wallet        [-w]   - wallet id\n' +
      '    --m                    - threshold to spend\n' +
      '    --n                    - total number of cosigners\n' +
      '    --cosigner-name  [-c]  - cosigner creating wallet\n' +
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '  --join-wallet            - create multisig wallet\n' +
      '    --join-key       [-j]  - authentication key to join with\n' +
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --cosinger-name  [-c]  - cosigner joining wallet\n' +
      '  --create-proposal\n' +
      '    --wallet         [-w]  - wallet id\n' +
      '    --memo                 - string description of proposal\n' +
      '    --value                - amount in transaction output\n' +
      '    --recipient            - base58/bech32 encoded address\n' +
      '    --token                - optional\n' +
      '  --approve-proposal\n' +
      '    --proposal-id          - integer proposal id, use --get-proposals\n'+
      '    --index         [-i]   - bip44 account index\n');
  }
}

(async () => {
  const cli = new CLI();
  await cli.open();
  await cli.destroy();
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
