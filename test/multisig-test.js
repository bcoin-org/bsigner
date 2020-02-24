/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const {Path, DeviceManager, generateToken, prepareSignMultisig, vendors} =
  require('../lib/bsigner');
const {wallet, Network, protocol, FullNode} = require('bcoin');
const {NodeClient} = require('bclient');
const bmultisig = require('bmultisig/lib/bmultisig');
const Proposal = require('bmultisig/lib/primitives/proposal');
const MultisigClient = require('bmultisig/lib/client');
const sigUtils = require('bmultisig/lib/utils/sig');
const CosignerContext = require('./utils/cosigner-context');
const {getLogger, getTestVendors} = require('./utils/common');
const {CREATE} = Proposal.payloadType;

/*
 * file level constants and globals
 */
const n = 'regtest';
// set the network globally
Network.set(n);
const network = Network.get(n);

// wallet server
let walletNode;
// full node
let fullNode;
// node client bclient.NodeClient
let nodeClient;
// client for interacting with the wallet server
// bclient.WalletClient
let client;
// signer
let manager;
// null bytes
const NULL32 = Buffer.alloc(32);
// global instance of a logger
// can be passed to DeviceManager instance
const logger = getLogger();
const enabledVendors = getTestVendors();

const cosignersGroup1 = [
  {
    path: Path.fromList([44,1,0], true),
    name: 'one',
    ctx: null
  }, {
    path: Path.fromList([44,1,1], true),
    name: 'two',
    ctx: null
  }, {
    path: Path.fromList([44,1,2], true),
    name: 'three',
    ctx: null
  }
];

const cosignersGroup2 = [
  {
    path: Path.fromList([44,1,3], true),
    name: 'four',
    ctx: null
  }, {
    path: Path.fromList([44,1,4], true),
    name: 'five',
    ctx: null
  }, {
    path: Path.fromList([44,1,5], true),
    name: 'six',
    ctx: null
  }
];

describe('Multisig', function() {
  this.timeout(1e7);

  if (enabledVendors.size !== 1)
    this.skip();

  /*
   * TODO: be sure to test both legacy and segwit
   * also, why does this test hang?
   *
   * test the multisig workflow with hardware signing
   * the high level workflow is as follows:
   *
   * 1   - create multisig wallet
   * 2   - join multisig wallet, get receive address
   * 2.5 - mine blocks to address
   * 3   - create proposal
   * 4   - approve proposal by submitting valid signature
   * 5   - validate transaction
   */
  const oldCBMaturity = protocol.consensus.COINBASE_MATURITY;
  before(async () => {
    // allow for spending coinbase outputs immediately
    protocol.consensus.COINBASE_MATURITY = 0;

    /*
     * set up wallet server
     * with the bmultisig plugin
     */
    walletNode = new wallet.Node({
      apiKey: NULL32.toString('hex'),
      nodeApiKey: NULL32.toString('hex'),
      logConsole: true,
      memory: true,
      workers: true,
      listen: true,
      loader: require,
      port: network.walletPort,
      network: n,
      noWallet: true,
      plugins: [bmultisig.Plugin],
      // must turn auth on for anything
      // to work, this seems like a bug
      walletAuth: true,
      // be sure to set the admin token
      adminToken: NULL32.toString('hex'),
      logger: logger
    });

    fullNode = new FullNode({
      apiKey: NULL32.toString('hex'),
      port: network.port,
      memory: true,
      workers: true,
      network: network.type
    });

    client = new MultisigClient({
      port: network.walletPort,
      apiKey: NULL32.toString('hex'),
      token: NULL32.toString('hex'),
      network: network
    });

    nodeClient = new NodeClient({
      apiKey: NULL32.toString('hex'),
      port: network.rpcPort,
      network: network.type
    });

    manager = DeviceManager.fromOptions({
      vendor: enabledVendors,
      network: network,
      logger,
      [vendors.LEDGER]: {
        timeout: 0
      },
      [vendors.TREZOR]: {
        debugTrezor: false
      }
    });

    await logger.open();
    await manager.open();
    // be sure to open the full node
    // before opening the wallet server
    await fullNode.ensure();
    await fullNode.open();
    await walletNode.ensure();
    await walletNode.open();

    for (const vendor of enabledVendors) {
      try {
        await manager.selectDevice(vendor);
      } catch (e) {
        throw new Error(`Could not select device for ${vendor}.`);
      }
    }
  });

  after(async () => {
    protocol.consensus.COINBASE_MATURITY = oldCBMaturity;
    await logger.close();
    await manager.close();
    await walletNode.close();
    await fullNode.close();
  });

  /*
   * this test tests the generateToken function and joining
   * a multisig wallet using an xpub from the device
   * 3 of 3 multisig wallet
   *
   * do this for both a p2sh wallet
   * and a p2wsh wallet
   *
   * cosigner one initializes the wallet
   *
   * 1 - use generateToken to create cosigner token
   * 2 - get account extended public key to join wallet
   * 3 - send request to join wallet
   * 4 - assert that the wallet was created
   *
   * do this both for witness and standard wallets
   */
  const walletTypes = ['witness', 'standard'];
  const walletIds = ['foo', 'bar'];
  let minedSoFar = 0;

  for (const [ii, walletType] of Object.entries(walletTypes)) {
    // wallet id used in many places
    const walletId = walletIds[ii];

    /*
     * use different cosigners for each set of tests
     */
    const cosignersInfo = walletType === 'standard'
                        ? cosignersGroup1
                        : cosignersGroup2;

    const firstCosigner = {
      path: cosignersInfo[0].path,
      ctx: new CosignerContext({
        network: network,
        walletName: walletId,
        name: cosignersInfo[0].name
      })
    };

    const cosigners = [firstCosigner];

    for (const cosignerInfo of cosignersInfo.slice(1)) {
      const cosigner = {
        path: cosignerInfo.path,
        ctx: new CosignerContext({
          network: network,
          walletName: walletId,
          name: cosignerInfo.name,
          joinPrivKey: firstCosigner.ctx.joinPrivKey
        })
      };

      cosigners.push(cosigner);
    }

    it('should prepare cosigner data', async () => {
      // This will collect
      //  - account public key
      //  - token
      //  - xpub proof
      // That are necessary for signing and further operations and
      // collect them inside Cosigner Context for testing purposes.
      for (const cosigner of cosigners) {
        await collectCosignerInfo(manager, cosigner);
      }
    });

    it('should create a multisig wallet', async () => {
      const cosigner = cosigners[0];

      const joinPubKey = cosigner.ctx.joinPubKey.toString('hex');
      const options = cosigner.ctx.toHTTPOptions();

      // if wallet type is witness, make a segwit wallet
      const witness = walletType === 'witness';

      const response = await client.createWallet(walletId, {
        witness: witness,
        m: 3,
        n: 3,
        joinPubKey: joinPubKey,
        ...options
      });

      assert.ok(response);
      assert.equal(response.initialized, false);
    });

    /*
     * this test fully joins the wallet with the
     * 2 remaining cosigners and then asserts
     * that the initialized value on wallet info
     * is set to true
     */
    it('should join with other cosigners', async () => {
      const toJoin = [cosigners[1], cosigners[2]];

      for (const {ctx} of toJoin) {
        const wallet = client.wallet(walletId, ctx.token.toString('hex'));

        const response = await wallet.joinWallet(ctx.toHTTPOptions());
        assert.ok(response);
      }

      // assert that it has been fully initialized
      const info = await client.getInfo(walletId);
      assert.equal(info.initialized, true);
    });

    /*
     *
     */
    it('should mine blocks to the receive address', async () => {
      const toMine = 3;

      const {receiveAddress} = await client.getAccount(walletId);
      await nodeClient.execute('generatetoaddress', [toMine, receiveAddress]);

      // keep track of the running total
      minedSoFar += toMine;

      // TODO: listen to wallet events.
      await new Promise(r => setTimeout(r, 500));
      const nodeInfo = await nodeClient.getInfo();
      const walletInfo = await client.getInfo(walletId);

      // it is in the expected state
      // each coinbase was given to the multisig
      assert.equal(nodeInfo.chain.height, minedSoFar);
      // this is very fragile and can break
      assert.equal(walletInfo.balance.tx, toMine);
    });

    /*
     * this test creates a proposal using cosigner1
     * it is important to use the right tokens
     * it asserts that the right information is saved
     */
    it('should create a proposal', async () => {
      const cosigner = cosigners[0];
      const token = await generateToken(manager, cosigner.path);

      const wallet = client.wallet(walletId, token.toString('hex'));
      const {changeAddress} = await wallet.getAccount();

      const opts = {
        memo: 'foobar mike jones',
        timestamp: now(),
        txoptions: {
          rate: 1e3,
          outputs: [{value: 1e10, address: changeAddress}]
        }
      };

      const signature = cosigner.ctx.signProposal(CREATE, opts);

      const proposal = await wallet.createProposal({
        proposal: opts,
        signature: signature.toString('hex')
      });

      const authorDetails = proposal.cosignerDetails[proposal.author];

      assert.equal(proposal.memo, opts.memo);
      assert.equal(authorDetails.name, cosigner.ctx.name);
      assert.equal(proposal.statusCode, Proposal.status.PROGRESS);
    });

    /*
     * approve the proposal by having both cosigners
     * send their signatures
     */
    it('should approve proposal', async () => {
      const toApprove = [cosigners[0], cosigners[1], cosigners[2]];
      const proposals = await client.getProposals(walletId);

      // only have created a single proposal
      const proposal = proposals[0];

      // keep track of which cosigner it is iterating
      // over with j
      for (const [j, cosigner] of Object.entries(toApprove)) {
        const {ctx} = cosigner;
        const wallet = client.wallet(walletId, ctx.token.toString('hex'));

        const {mtx, inputData} = await prepareSignMultisig({
          pid: proposal.id,
          wallet: wallet,
          network: network,
          path: cosigner.path.clone()
        });

        const signatures = await manager.getSignatures(mtx, inputData);

        // do not broadcast explicitly, so we can assert on it
        const broadcast = false;

        const approval = await wallet.approveProposal(proposal.id, {
          signatures,
          broadcast
        });

        // cast j to an integer and when it is the final
        // cosigner, assert that it is approved and otherwise
        // assert that it is in progress
        if ((j >> 0) === (toApprove.length - 1))
          assert.equal(approval.proposal.statusCode, Proposal.status.APPROVED);
        else
          assert.equal(approval.proposal.statusCode, Proposal.status.PROGRESS);

        assert.equal(approval.broadcasted, broadcast);
      }
    });
  }
});

/**
 * We need to gather:
 *  - accountKey / public key
 *  - generate token
 *  - xpub proof
 * public key and xpub Proof
 */

async function collectCosignerInfo(manager, cosigner) {
  const {ctx, path} = cosigner;

  const proofPath = path.clone();
  proofPath
    .push(sigUtils.PROOF_INDEX, false)
    .push(0, false);

  const accountKey = await manager.getPublicKey(path);
  const token = await generateToken(manager, path);

  ctx.accountKey = accountKey;
  ctx.token = token;

  const joinMessage = ctx.joinMessage;

  const signature = await manager.signMessage(proofPath, joinMessage);

  ctx.xpubProof = signature;
}

function now() {
  return Math.floor(Date.now() / 1000);
}
