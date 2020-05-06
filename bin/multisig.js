#!/usr/bin/env node

'use strict';

const assert = require('bsert');
const Config = require('bcfg');
const {Network} = require('bcoin');
const Logger = require('blgr');
const secp256k1 = require('bcrypto/lib/secp256k1');
const MultisigClient = require('bmultisig/lib/client');
const Proposal = require('bmultisig/lib/primitives/proposal');
const {CREATE, REJECT} = Proposal.payloadType;
const sigUtils = require('bmultisig/lib/utils/sig');
const {vendors} = require('../lib/common');

const {Path} = require('../lib/path');
const Signer = require('../lib/signer');
const {prepareSignMultisig, generateToken, guessPath} = require('../lib/app');

/*
 * Manage Multisig wallets with bcoin and watch only wallets
 *
 */

class CLI {
  constructor() {
    this.config = new Config('bsigner', {
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

    this.logger = Logger.global;
    this.manager = null;

    this.path = null;
    this.authPath = null;

    if (this.config.str('config'))
      this.config.open(this.config.path('config'));
  }

  async open() {
    this.logger = new Logger(this.config.str('loglevel', 'error'));
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

    if (this.config.has('path')) {
      this.path = Path.fromString(this.config.str('path'));
    } else if (this.config.has('index')) {
      this.path = Path.fromOptions({
        network: network.type,
        purpose: Path.harden(this.config.str('purpose', '44h')),
        account: Path.harden(this.config.str('index')),
        // allow for custom coin paths
        coin: this.config.uint('coin')
      });
    }

    if (this.config.has('auth-path'))
      this.authPath = Path.fromString(this.config.str('auth-path'));

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
     * initialize hardware
     */
    const vendor = this.config.str('vendor');
    this.manager = Signer.fromOptions({
      logger: this.logger,
      network: network,
      vendor: vendor,
      [vendors.LEDGER]: {
        timeout: this.config.uint('ledger-timeout', 50000)
      },
      [vendors.MEMORY]: {
        phrase: this.config.str('memory-phrase')
      },
      [vendors.TREZOR]: {
        debugTrezor: this.config.bool('trezor-debug', false)
      }
    });

    await this.manager.open();
    const device = await this.manager.selectDevice(vendor.toUpperCase());

    await device.open();

    /*
     * get proposals
     */
    if (this.config.has('get-proposals')) {
      const cosignerToken = await generateToken(this.manager, this.path);
      const wname = this.config.str('wallet');
      const wallet = this.client.wallet(wname, cosignerToken.toString('hex'));
      const proposals = await wallet.getProposals(true);

      out.response = proposals;
      console.log(JSON.stringify(out, null, 2));
      process.exit();
    }

    /*
     * create multisig wallet
     */
    if (this.config.has('create-wallet')) {
      const cosignerToken = await generateToken(this.manager, this.path);
      const hdpubkey = await this.manager.getPublicKey(this.path);
      const cosignerPurpose = this.path.purpose;
      const cosignerFingerPrint = hdpubkey.parentFingerPrint;

      // Use can also provide joinPrivKey
      let joinPrivKey;
      if (this.config.has('join-priv-key')) {
        joinPrivKey = this.config.buf('join-priv-key');

        if (!secp256k1.privateKeyVerify(joinPrivKey))
          throw new Error('join-priv-key is not valid secp256k1 private key.');
      } else {
        joinPrivKey = secp256k1.privateKeyGenerate();
      }

      const joinPubKey = secp256k1.publicKeyCreate(joinPrivKey, true);
      const authPubkeyHD = await this.manager.getPublicKey(this.authPath);
      const authPubKey = authPubkeyHD.publicKey;
      const cosignerName = this.config.str('cosigner-name');
      const wallet = this.config.str('wallet');

      const joinMessage = sigUtils.encodeJoinMessage(wallet, {
        name: cosignerName,
        key: hdpubkey,
        authPubKey
      }, network);

      const joinSignature = sigUtils.signMessage(joinMessage, joinPrivKey);

      let accountKeyProof;
      {
        const proofPath = `${this.path.toString()}/${sigUtils.PROOF_INDEX}/0`;
        const sigPub = await this.manager.getPublicKey(proofPath);
        const sig = await this.manager.signMessage(proofPath, joinMessage);
        const verify = sigUtils.verifyMessage(
          joinMessage,
          sig,
          sigPub.publicKey
        );

        // is path correct?
        assert(verify, 'Invalid account key proof.');
      }

      // token in POST body will not overwrite client token
      const response = await this.client.createWallet(wallet, {
        m: this.config.uint('m'),
        n: this.config.uint('n'),
        witness: this.config.bool('segwit', false),
        joinPubKey: joinPubKey.toString('hex'),
        joinSignature: joinSignature.toString('hex'),
        cosigner: {
          token: cosignerToken.toString('hex'),
          name: cosignerName,
          purpose: cosignerPurpose,
          fingerPrint: cosignerFingerPrint,
          accountKey: hdpubkey.xpubkey(network.type),
          accountKeyProof: accountKeyProof,
          authPubKey: authPubKey.toString('hex')
        }
      });

      out.path = this.path.toString();
      out.joinPrivKey = joinPrivKey.toString('hex');
      out.response = response;

      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (this.config.has('join-wallet')) {
      const cosignerToken = await generateToken(this.manager, this.path);
      const hdpubkey = await this.manager.getPublicKey(this.path);
      const cosignerPurpose = this.path.purpose;
      const cosignerFingerPrint = hdpubkey.parentFingerPrint;
      const wallet = this.config.str('wallet');
      const authPubkeyHD = await this.manager.getPublicKey(this.authPath);
      const authPubKey = authPubkeyHD.publicKey;
      const cosignerName = this.config.str('cosigner-name');
      const joinPrivKey = this.config.buf('join-priv-key');
      const joinPubKey = secp256k1.publicKeyCreate(joinPrivKey, true);

      assert(secp256k1.privateKeyVerify(joinPrivKey),
        'Invalid join priv key.');

      const joinMessage = sigUtils.encodeJoinMessage(wallet, {
        name: cosignerName,
        key: hdpubkey,
        authPubKey
      }, network);

      const joinSignature = sigUtils.signMessage(joinMessage, joinPrivKey);

      let accountKeyProof;
      {
        const proofPath = `${this.path.toString()}/${sigUtils.PROOF_INDEX}/0`;
        const sigPub = await this.manager.getPublicKey(proofPath);
        const sig = await this.manager.signMessage(proofPath, joinMessage);
        const verify = sigUtils.verifyMessage(
          joinMessage,
          sig,
          sigPub.publicKey
        );

        // is path correct?
        assert(verify, 'Invalid account key proof.');
      }

      const response = await this.client.joinWallet(wallet, {
        joinPubKey: joinPubKey.toString('hex'),
        joinSignature: joinSignature.toString('hex'),
        cosigner: {
          token: cosignerToken.toString('hex'),
          name: cosignerName,
          purpose: cosignerPurpose,
          fingerPrint: cosignerFingerPrint,
          accountKey: hdpubkey.xpubkey(network.type),
          accountKeyProof: accountKeyProof,
          authPubKey: authPubKey.toString('hex')
        }
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
      const cosignerToken = await generateToken(this.manager, this.path);

      const wallet = this.config.str('wallet');
      const proposalOptions = {
        memo: this.config.str('memo'),
        timestamp: now(),
        txoptions: {
          rate: this.config.uint('rate', 1e3),
          outputs: [{
            value: this.config.uint('value'),
            address: this.config.str('recipient')
          }]
        }
      };

      const propMessage = sigUtils.encodeProposalJSON(
        wallet,
        CREATE,
        JSON.stringify(proposalOptions)
      );

      const sig = await this.manager.signMessage(this.authPath, propMessage);

      const walletClient = this.client.wallet(
        this.config.str('wallet'),
        cosignerToken.toString('hex')
      );

      const proposal = await walletClient.createProposal({
        proposal: proposalOptions,
        signature: sig.toString('hex')
      });

      out.response = proposal;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (this.config.has('approve-proposal')) {
      const pid = this.config.uint('proposal-id');
      const cosignerToken = await generateToken(this.manager, this.path);
      const walletClient = this.client.wallet(
        this.config.str('wallet'),
        cosignerToken.toString('hex')
      );

      const {mtx, inputData} = await prepareSignMultisig({
        pid,
        path: this.path,
        wallet: walletClient,
        network
      });

      const signatures = await this.manager.getSignatures(mtx, inputData);

      if (!signatures)
        throw new Error('problem signing transaction');

      const approval = await walletClient.approveProposal(pid, {
        signatures: signatures,
        broadcast: this.config.bool('broadcast', true)
      });

      out.response = approval;
      out.path = this.path;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }

    if (this.config.str('reject-proposal')) {
      const cosignerToken = await generateToken(this.manager, this.path);
      const wname = this.config.str('wallet');
      const pid = this.config.uint('proposal-id');
      const wallet = this.client.wallet(wname, cosignerToken.toString('hex'));
      const proposal = await wallet.getProposalInfo(pid);

      const message = sigUtils.encodeProposalJSON(
        wname,
        REJECT,
        JSON.stringify(proposal.options)
      );

      const signature = await this.manager.signMessage(this.authPath, message);
      const rejection = await wallet.rejectProposal(pid, {
        signature: signature.toString('hex')
      });

      out.response = rejection;
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
  }

  async destroy() {
    await this.manager.close();
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

      if (!this.config.has('auth-path')) {
        msg += 'must pass `auth-path`\n';
        valid = false;
      }
    }

    if (this.config.has('join-wallet')) {
      if (!this.config.has('join-priv-key')) {
        msg += 'must pass join priv key\n';
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

      if (!this.config.has('auth-path')) {
        msg += 'must pass `auth-path`\n';
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

      if (!this.config.has('auth-path')) {
        msg += 'must pass `auth-path`\n';
        valid = false;
      }
    }

    if (this.config.str('approve-proposal')) {
      if (!this.config.has('proposal-id')) {
        msg += 'must pass proposal id\n';
        valid = false;
      }
    }

    if (this.config.str('reject-proposal')) {
      if (!this.config.has('proposal-id')) {
        msg += 'must pass proposal id\n';
        valid = false;
      }

      if (!this.config.has('auth-path')) {
        msg += 'must pass `auth-path`\n';
        valid = false;
      }
    }

    if (this.config.has('auth-path')) {
      try {
        Path.fromString(this.config.str('auth-path'));
      } catch (e) {
        msg += 'auth-path is not proper derivation path.';
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
      '  --vendor           [-v]  - ledger or trezor\n' +
      '  --network          [-n]  - ledger or trezor\n' +
      '  --ledger-timeout=50000   - ledger timeout\n' +
      '  --memory-phrase          - memory vendor mnemonic\n' +
      '  --get-info               - get multisig wallet info\n' +
      '    --wallet         [-w]  - wallet id\n' +
      '    --token                - authentication token\n' +
      '  --get-proposals\n'+
      '    --wallet         [-w]  - wallet id\n' +
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '  --create-wallet          - create multisig wallet\n' +
      '    --wallet         [-w]  - wallet id\n' +
      '    --m                    - threshold to spend\n' +
      '    --n                    - total number of cosigners\n' +
      '    --cosigner-name  [-c]  - cosigner creating wallet\n' +
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '    --join-priv-key        - private key shared by cosigners\n' +
      '    --auth-path            - path to the proposal auth key\n' +
      '  --join-wallet            - create multisig wallet\n' +
      '    --join-key       [-j]  - authentication key to join with\n' +
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '    --cosinger-name  [-c]  - cosigner joining wallet\n' +
      '    --auth-path            - path to the proposal auth key\n' +
      '  --create-proposal\n' +
      '    --wallet         [-w]  - wallet id\n' +
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '    --memo                 - string description of proposal\n' +
      '    --value                - amount in transaction output\n' +
      '    --recipient            - base58/bech32 encoded address\n' +
      '    --auth-path            - path to the proposal auth key\n' +
      '  --approve-proposal\n' +
      '    --wallet         [-w]  - wallet id\n' +
      '    --proposal-id          - integer proposal id, use --get-proposals\n'+
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '  --reject-proposal\n' +
      '    --wallet         [-w]  - wallet id\n' +
      '    --proposal-id          - integer proposal id, use --get-proposals\n'+
      '    --index          [-i]  - index of hd public key to use\n' +
      '    --path                 - bip44 path\n' +
      '    --auth-path            - path to the proposal auth key\n'
    );
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

function now() {
  return Math.floor(Date.now() / 1000);
}
