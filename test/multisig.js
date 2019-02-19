const assert = require('bsert');
const blgr = require('blgr');
const {Path,Hardware,generateToken} = require('../lib/libsigner');
const {wallet,Network,protocol,FullNode,MTX,Coin} = require('bcoin');
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
// node client
let nodeClient;
// client for interacting with the wallet server
let client;
// signer
let hardware;
// null bytes
const NULL32 = Buffer.alloc(32);
// global instance of a logger
// can be passed to Hardware instance
const logger = new blgr('debug');

// keep track of join key to allow other
// cosigners to join
let joinKey;

// cosigner info
let cosigners = {
  one: {
    path: Path.fromList([44,1,0], true),
    name: 'one',
  },
  two: {
    path: Path.fromList([44,1,1], true),
    name: 'two',
  },
  three: {
    path: Path.fromList([44,1,2], true),
    name: 'three',
  },
};

// name of wallet for end to end testing
// it has to be global so that the same
// value can be used for creating and
// joining the same wallet
const walletIdOne = 'foobar';

describe('Multisig', function () {
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
      adminToken: NULL32.toString('hex'),
    });

    fullNode = new FullNode({
      apiKey: NULL32.toString('hex'),
      port: network.port,
      memory: true,
      workers: true,
      network: network.type,
    });

    client = new MultisigClient({
      port: network.walletPort,
      apiKey: NULL32.toString('hex'),
      token: NULL32.toString('hex'),
      network: network,
    });

    nodeClient = new NodeClient({
      apiKey: NULL32.toString('hex'),
      port: network.rpcPort,
      network: network.type,
    });

    hardware = Hardware.fromOptions({
      vendor: 'ledger',
      network: network,
      logger,
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
   * cosigner one initializes the wallet
   *
   * 1 - use generateToken to create cosigner token
   * 2 - get account extended public key to join wallet
   * 3 - send request to join wallet
   * 4 - assert that the wallet was created
   */
  it('should create a multisig wallet', async () => {
    const cosigner = cosigners.one;

    const token = await generateToken(hardware, cosigner.path);
    const hdpubkey = await hardware.getPublicKey(cosigner.path);
    const xpub = hdpubkey.xpubkey(network.type);

    const response = await client.createWallet(walletIdOne, {
      witness: false,
      accountKey: xpub,
      watchOnly: true,
      m: 3,
      n: 3,
      cosignerName: cosigner.name,
      cosignerPath: cosigner.path.toString(),
      cosignerToken: token.toString('hex'),
    });

    assert.ok(response);
    assert.equal(response.initialized, false);

    // keep track of the join key
    joinKey = response.joinKey;
  })

  /*
   * this test fully joins the wallet with the
   * 2 remaining cosigners and then asserts
   * that the initialized value on wallet info
   * is set to true
   */
  it('should join with other cosigners', async () => {
    const toJoin = [cosigners.two, cosigners.three];

    for (const cosigner of toJoin) {
      const token = await generateToken(hardware, cosigner.path);

      const hdpubkey = await hardware.getPublicKey(cosigner.path);
      const xpub = hdpubkey.xpubkey(network.type);

      const wallet = client.wallet(walletIdOne, token.toString('hex'));

      const response = await wallet.joinWallet({
        cosignerName: cosigner.name,
        cosignerPath: cosigner.path.toString(),
        cosignerToken: token.toString('hex'),
        joinKey: joinKey,
        accountKey: xpub,
      });
      assert.ok(response);
    }

    // assert that it has been fully initialized
    const info = await client.getInfo(walletIdOne)
    assert.equal(info.initialized, true);
  });

  /*
   *
   */
  it('should mine blocks to the receive address', async () => {
    const toMine = 3;

    const {receiveAddress} = await client.getAccount(walletIdOne);
    const mine = await nodeClient.execute('generatetoaddress', [toMine, receiveAddress]);

    const nodeInfo = await nodeClient.getInfo();
    const walletInfo = await client.getInfo(walletIdOne);

    // it is in the expected state
    // each coinbase was given to the multisig
    assert.equal(nodeInfo.chain.height, toMine);
    assert.equal(walletInfo.balance.tx, toMine);
  });

  /*
   * this test creates a proposal using cosigner1
   * it is important to use the right tokens
   * it asserts that the right information is saved
   */
  it('should create a proposal', async () => {
    const cosigner = cosigners.one;
    const token = await generateToken(hardware, cosigner.path);

    const wallet = client.wallet(walletIdOne, token.toString('hex'));
    const {changeAddress} = await wallet.getAccount();

    const opts = {
      memo: 'foobar mike jones',
      cosigner: cosigner.name,
      rate: 1e3,
      sign: false,
      account: 'default',
      outputs: [{value: 1e5, address: changeAddress}],
    }

    const proposal = await wallet.createProposal(opts);

    assert.equal(proposal.memo, opts.memo);
    assert.equal(proposal.authorDetails.name, cosigner.name);
    assert.equal(proposal.statusCode, Proposal.status.PROGRESS)
  });

  /*
   *
   */
  it('should approve proposal', async ($) => {
    $.skip();

    const toApprove = [cosigners.two, cosigners.three];
    const proposals = await client.getProposals(walletIdOne);

    // only have created a single proposal
    const proposal = proposals[0];

    // TODO: turn to for loop
    const cosigner = toApprove[0];
    const token = await generateToken(hardware, cosigner.path);
    const wallet = client.wallet(walletIdOne, token.toString('hex'));

    // {tx,paths,scripts,txs}
    const pmtx = await wallet.getProposalMTX(proposal.id, {
      paths: true,
      scripts: true,
      txs: true,
    });

    // transaction to sign
    const raw = Buffer.from(pmtx.tx.hex, 'hex');
    const mtx = MTX.fromRaw(raw);

    const paths = [];
    const inputTXs = [];
    const coins = [];
    const scripts = [];

    // TODO this is the fn to move to the library
    for (const [i, input] of Object.entries(pmtx.tx.inputs)) {
      // handle path
      let path = pmtx.paths[i];
      path = cosigner.path.push(path.branch).push(path.index);
      paths.push(path);

      // build input tx
      inputTXs.push(MTX.fromRaw(pmtx.txs[i], 'hex'));

      // handle script
      scripts.push(pmtx.scripts[i]);

      // handle coin
      const coin = Coin.fromJSON(input.coin);
      coins.push(coin);
      mtx.view.addCoin(coin);
    }

    const signature = await hardware.getSignature(mtx, {
      paths,
      inputTXs,
      coins,
      scripts,
      enc: 'hex',
    });

    const approval = await wallet.approveProposal(proposal.id, [signature]);
  });

  it('should close', async () => {
    await walletNode.close();
    await fullNode.close();
  });
});
