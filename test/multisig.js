/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const Logger = require('blgr');
const {Path, Hardware, generateToken, prepareSignMultisig} =
  require('../lib/libsigner');
const {wallet, Network, protocol, FullNode} = require('bcoin');
const {NodeClient} = require('bclient');
const bmultisig = require('bmultisig/lib/bmultisig');
const Proposal = require('bmultisig/lib/primitives/proposal');
const {MultisigClient} = require('bmultisig-client');

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
let hardware;
// null bytes
const NULL32 = Buffer.alloc(32);
// global instance of a logger
// can be passed to Hardware instance
const logger = new Logger('debug');

// keep track of join key to allow other
// cosigners to join
let joinKey;

// cosigner info
const cosignersInfo = {
  one: {
    path: Path.fromList([44,1,0], true),
    name: 'one'
  },
  two: {
    path: Path.fromList([44,1,1], true),
    name: 'two'
  },
  three: {
    path: Path.fromList([44,1,2], true),
    name: 'three'
  },
  four: {
    path: Path.fromList([44,1,3], true),
    name: 'four'
  },
  five: {
    path: Path.fromList([44,1,4], true),
    name: 'five'
  },
  six: {
    path: Path.fromList([44,1,5], true),
    name: 'six'
  }
};

describe('Multisig', function() {
  this.timeout(1e7);

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
      adminToken: NULL32.toString('hex')
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

    hardware = Hardware.fromOptions({
      vendor: 'ledger',
      network: network,
      logger
    });

    await logger.open();
    await hardware.initialize();
    // be sure to open the full node
    // before opening the wallet server
    await fullNode.ensure();
    await fullNode.open();
    await walletNode.ensure();
    await walletNode.open();
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
  const walletTypes = ['witness','standard'];
  const walletIds = ['foo', 'bar'];
  let minedSoFar = 0;
  for (const [ii, walletType] of Object.entries(walletTypes)) {
    /*
     * use different cosigners for each set of tests
     */
    let cosigners;
    if (walletType === 'standard')
      cosigners = [cosignersInfo.one, cosignersInfo.two, cosignersInfo.three];
    else
      cosigners = [cosignersInfo.four, cosignersInfo.five, cosignersInfo.six];

    // wallet id used in many places
    const walletId = walletIds[ii];

    it('should create a multisig wallet', async () => {
      const cosigner = cosigners[0];

      const token = await generateToken(hardware, cosigner.path);
      const hdpubkey = await hardware.getPublicKey(cosigner.path);
      const xpub = hdpubkey.xpubkey(network.type);

      // if wallet type is witness, make a segwit wallet
      const witness = walletType === 'witness';

      const response = await client.createWallet(walletId, {
        witness: witness,
        accountKey: xpub,
        watchOnly: true,
        m: 3,
        n: 3,
        cosignerName: cosigner.name,
        cosignerPath: cosigner.path.toString(),
        cosignerToken: token.toString('hex')
      });

      assert.ok(response);
      assert.equal(response.initialized, false);

      // keep track of the join key
      joinKey = response.joinKey;
    });

    /*
     * this test fully joins the wallet with the
     * 2 remaining cosigners and then asserts
     * that the initialized value on wallet info
     * is set to true
     */
    it('should join with other cosigners', async () => {
      const toJoin = [cosigners[1], cosigners[2]];

      for (const cosigner of toJoin) {
        const token = await generateToken(hardware, cosigner.path);

        const hdpubkey = await hardware.getPublicKey(cosigner.path);
        const xpub = hdpubkey.xpubkey(network.type);

        const wallet = client.wallet(walletId, token.toString('hex'));

        const response = await wallet.joinWallet({
          cosignerName: cosigner.name,
          cosignerPath: cosigner.path.toString(),
          cosignerToken: token.toString('hex'),
          joinKey: joinKey,
          accountKey: xpub
        });
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
      const token = await generateToken(hardware, cosigner.path);

      const wallet = client.wallet(walletId, token.toString('hex'));
      const {changeAddress} = await wallet.getAccount();

      const opts = {
        memo: 'foobar mike jones',
        cosigner: cosigner.name,
        rate: 1e3,
        sign: false,
        account: 'default',
        outputs: [{value: 1e5, address: changeAddress}]
      };

      const proposal = await wallet.createProposal(opts);

      assert.equal(proposal.memo, opts.memo);
      assert.equal(proposal.authorDetails.name, cosigner.name);
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
        // get the cosigner token
        const token = await generateToken(hardware, cosigner.path);
        const wallet = client.wallet(walletId, token.toString('hex'));

        // response is {tx,paths,scripts,txs}
        const pmtx = await wallet.getProposalMTX(proposal.id, {
          paths: true,
          scripts: true,
          txs: true
        });

        const {paths,inputTXs,coins,scripts,mtx} = prepareSignMultisig({
          pmtx,
          path: cosigner.path.clone()
        });

        const signatures = await hardware.getSignature(mtx, {
          paths,
          inputTXs,
          coins,
          scripts,
          enc: 'hex'
        });

        // do not broadcast explicitly, so we can assert on it
        const shouldBroadcast = false;

        const approval = await wallet.approveProposal(
          proposal.id, signatures, shouldBroadcast);

        // cast j to an integer and when it is the final
        // cosigner, assert that it is approved and otherwise
        // assert that it is in progress
        if ((j >> 0) === (toApprove.length - 1))
          assert.equal(approval.proposal.statusCode, Proposal.status.APPROVED);
        else
          assert.equal(approval.proposal.statusCode, Proposal.status.PROGRESS);

        assert.equal(approval.broadcasted, shouldBroadcast);
      }
    });
  }

  it('should close', async () => {
    await walletNode.close();
    await fullNode.close();
  });
});
