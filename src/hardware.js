'use strict';

const trezor = require('trezor.js');
const bledger = require('bledger')
const {LedgerBcoin,LedgerTXInput} = bledger;
const {Device} = bledger.HID;
const assert = require('bsert');
const {Lock} = require('bmutex');
const blgr = require('blgr');
const {HDPublicKey,TX} = require('bcoin');
const {opcodes} = require('bcoin/lib/script/common');

const {vendors,bip44,parsePath,sleep} = require('./common');

const {Path} = require('./path');

const {promisify} = require('util');
const child_process = require('child_process');
const exec = promisify(child_process.exec);

/*
 * Hardware Class
 * wrapper around ledger and trezor
 * hardware wallets
 *
 * TODO: implement LOCAL flag
 */
class Hardware {
  constructor(options) {

    this.initialized = false;
    this.logger = new blgr();
    this.lock = new Lock(false);
    this.device = null;
    this.retry = false;
    this.retryCount = 3;
    this.retries = 0;
    this.network = null;
    this.trezordDebug = false;

    if (options)
      this.fromOptions(options);
  }

  /*
   * initialize and connect to hardware
   * device. must be ran before
   * any other operations
   */
  async initialize() {
    if (this.logger.closed)
      await this.logger.open();

    this.logger.debug('attempting %s initialization', this.vendor);

    try {
      switch (this.vendor) {
        case vendors.LEDGER: {

          const devices = await Device.getDevices();

          if (devices.length === 0)
            throw new Error('No Ledger device detected');

          // support only 1 device at a time
          const device = new Device({
            device: devices[0],
            timeout: 1e4,
          });
          await device.open();

          // handle both bcoin.Networks type or string
          const network = this.network.type ? this.network.type : this.network;

          // TODO: handle ledger disconnect
          this.device = new LedgerBcoin({
            device,
            network,
          });

          this.initialized = true;

          break;
        }

        case vendors.TREZOR: {
          const debug = this.logLevel === 'debug';
          // TODO: falsy debug for now, its overwhelming

          // TODO: enumerate to make sure one is connected
          this.device = true;

          /*
          const list = new trezor.DeviceList({ debug: this.trezordDebug });

          list.on('connect', device => {
            // only support 1 device at a time
            // TODO: there is a bug here
            if (this.device) {
              this.logger.debug('trezor device already connected');
              return;
            }

            this.device = device;
            this.logger.debug('connecting trezor device id: %s', device.features.device_id);

            this.device.on('disconnect', () => {
              this.logger.debug('disconnecting trezor device id: %s', device.features.device_id);
              this.device = null;
            });
          });

          // HACK: allow events to happen
          // is this sleep long enough?
          await sleep(1e3);
          if (!this.device)
            throw new Error('no Trezor device detected');

          */
          this.initialized = true;
          break;
        }

        case vendors.LOCAL: {
          throw new Error('local signing is not available yet');
        }

        default:
          throw new Error('unknown vendor type:' + this.vendor);
      }
    } catch (e) {
      this.logger.debug(e.message);
      if (this.retry && (this.retries < this.retryCount)) {
        this.retries++;
        this.logger.debug('retrying attempt %d in %d seconds', this.retries, 10);
        await sleep(1e4);
        await this.initialize()
      }
      throw e;
    }
  }

  /*
   * TODO: properly close this.device
   * figure out how to get trezor to not hang open
   */
  async close() {
    switch (this.vendor) {
      case vendors.LEDGER:
        break;
      case vendors.TREZOR:
        break;
      case vendors.LOCAL:
        break;
    }
  }

  refresh() {
    this.initialized = false;
    this.device = null;
  }

  /*
   * ensure the Hardware instance
   * has been initialized
   * @throws
   */
  ensureInitialized() {
    if (!this.initialized)
      throw new Error('must initialize Hardware')

    if (!this.device)
      throw new Error('device not found')
  }

  /*
   * get public key with a lock
   * @param path {String|[]Integer}
   * @returns bcoin.HDPublicKey
   */
  async getPublicKey(path) {
    this.ensureInitialized();

    if (Path.isPath(path))
      path = path.toString();

    assert(Array.isArray(path) || typeof path === 'string');

    const unlock = await this.lock.lock();

    this.logger.debug('getting public key for path %s', path);

    try {
      return await this._getPublicKey(path);
    } catch (e) {
      this.logger.debug(e.stack);
    } finally {
      unlock();
    }
  }

  /*
   * get public key based on vendor
   * @param path {String|[]Integer}
   * @returns bcoin.HDPublicKey
   */
  async _getPublicKey(path) {
    switch (this.vendor) {
      case vendors.LEDGER: {
        return await this.device.getPublicKey(path);
      }
      case vendors.TREZOR: {

        // TEMPORARY HACKS
        const pythonPath = '/Users/marktyneway/python/trezor-signing/bin/python';
        const filename = '/Users/marktyneway/Projects/github.com/tynes/trezor-signing/main.py';

        const { stdout, stderr, error } = await exec(`${pythonPath} ${filename} get_public_key --path="${path}"`)

        const node = JSON.parse(stdout);

        return HDPublicKey.fromOptions({
          depth: node.depth,
          childIndex: node.childIndex,
          chainCode: Buffer.from(node.chainCode, 'hex'),
          publicKey: Buffer.from(node.publicKey, 'hex'),
          parentFingerPrint: node.parentFingerPrint,
        });
      }
      default:
        return null;
    }
  }

  /*
   * sign transaction with a lock
   * and validate options
   * @param options {Object}
   */
  async signTransaction(tx, options) {
    this.ensureInitialized();
    // TODO: validate options
    // TODO: validate tx
    // TODO: validate paths
    // TODO: validate scripts

    // trezor only works with main and testnet
    // because it relies on their bitcore
    /*
    if (this.vendor === vendors.TREZOR) {
      if (this.network.type === 'regtest' || this.network.type === 'simnet') {
        throw new Error(`unsupported vendor ${this.vendor} with network ${this.network}`);
      }
    }
    */

    const inputTXs = options.inputTXs || [];
    const coins = options.coins || [];
    const paths = options.paths || [];
    const scripts = options.scripts || [];

    // turn to string representation
    for (let i = 0; i < paths.length; i++) {
      if (Path.isPath(paths[i]))
        paths[i] = paths[i].toString();
    }

    this.logger.debug('starting sign transaction');

    const unlock = await this.lock.lock();

    try {
      return await this._signTransaction(tx, inputTXs, coins, paths, scripts);
    } catch (e) {
      this.logger.error(e.stack);
    } finally {
      unlock();
    }
  }

  /*
   * sign transaction based on vendor type
   * @param tx {bcoin.MTX} - transaction to sign
   * @param inputTXs {[]bcoin.MTX} - inputs represented as MTXs
   * @param coins {[]bcoin.Coin} - inputs represented as Coins
   * @param paths {String|[]Integer} - paths to inputs to sign
   * @param scripts {[]Integer} - redeem scripts for inputs
   * @returns @bcoin.TX
   *
   * TODO: rename tx to mtx
   */
  async _signTransaction(tx, inputTXs, coins, paths, scripts) {
    switch (this.vendor) {
      case vendors.LEDGER: {
        const ledgerInputs = this.ledgerInputs(tx, inputTXs, coins, paths, scripts);

        const result = await this.device.signTransaction(tx, ledgerInputs);

        /*
         * this is a lot of code just to do some debug logging
         * but its nice to see the signatures
         */
        this.logger.debug('(w)txid: %s', result.wtxid());
        for (let [i, input] of Object.entries(result.inputs)) {
          if (input.witness.length)
            this.logger.debug(`witness: ${input.witness.toString('hex')}`);
          else if (input.script.length) {
            let scriptsig = input.script.getPubkeyhashInput();
            if (scriptsig)
              scriptsig = scriptsig.map(s => s ? s.toString('hex') : null);
            this.logger.debug('input %s, scriptSig: %s', i, scriptsig);
          }
        }

        return result;
      }

      // TODO: test this!
      case vendors.TREZOR: {
        const [trezorInputs, refTXs] = this.trezorInputs(tx, inputTXs, coins, paths, scripts);

        const trezorOutputs = this.trezorOutputs(tx);

        // select proper trezor network
        let network = 'bitcoin';
        if (this.network.type === 'testnet')
          network = 'Testnet';

        const lockTime = tx.locktime;

        // TEMPORARY HACKS
        const pythonPath = '/Users/marktyneway/python/trezor-signing/bin/python';
        const filename = '/Users/marktyneway/Projects/github.com/tynes/trezor-signing/main.py';

        const json = {};

        const { stdout, stderr, error } = await exec(`${pythonPath} ${filename} sign_tx --json=${json}`)

        /*
        const response = await this.device.waitForSessionAndRun(async session => {
          // inputs, outputs, txs?, coinType
          return await session.signTx(trezorInputs, trezorOutputs, refTXs, network, lockTime);
        });

        // TODO: better error checking
        // expecing the type to be trezor.SignedTx
        // when it works as expected
        if (response.type !== 'trezor.SignedTx')
          throw new Error('Error signing transaction');

        const hex = response.message.serialized.serialized_tx;
        const transaction = TX.fromRaw(hex, 'hex');

        return transaction;
        */
      }
    }
  }

  /*
   *
   */
  trezorOutputs(mtx) {
    const outputs = [];

    for (const [i, output] of mtx.outputs.entries()) {
      this.logger.debug('output number: %s', i);

      let address, scriptType;
      const segwit = this.isSegwit(output);
      if (segwit) {
        address = output.getAddress().toBech32(this.network);
        // TODO: for change output need to set scriptType
        // to 'PAYTOWITNESS' if its to address from same account xpub
        // need keyring to determine this?
      } else {
        address = output.getAddress().toBase58(this.network);
      }
      scriptType = 'PAYTOADDRESS';

      const amount = output.value.toString();

      this.logger.debug('output address: %s', address);
      this.logger.debug('output amount: %s', amount);

      outputs.push({
        address,
        amount,
        script_type: scriptType,
      });
    }

    return outputs;
  }

  // TODO: handle pubkeys properly
  /*
   *
   */
  trezorMultisigInput(trezorInput) {
    const input = { ...trezorInput };
    const pubkeys = [];

    input.script_type = 'SPENDMULTISIG';

    const sorted = pubkeys.slice().sort((a, b) => {
      const k1 = a.derive(branch).derive(index);
      const k2 = b.derive(branch).derive(index);
      return k1.publicKey.compare(k2.publicKey);
    });

    input.multisig = {
      pubkeys: sorted.map(key => ({
        node: {
          depth: key.depth,
          child_num: key.childIndex,
          fingerprint: key.parentFingerPrint,
          public_key: key.publicKey.toString('hex'),
          chain_code: key.chainCode.toString('hex'),
        },
        address_n: [branch, index],
      })),
      signatures: pubkeys.map(() => ''),
      m: m,
    };

    return input;
  }

  /*
   *
   */
  trezorInputs(mtx, inputTXs, coins, paths, scripts) {
    const inputs = [];
    const refTXs = [];

    for (const [i, input] of mtx.inputs.entries()) {
      this.logger.debug('input number: %s', i);

      let path = paths[i];
      if (typeof path === 'string')
        path = parsePath(path, true);

      this.logger.debug('using path %s', path);

      const coin = coins[i];
      if (!coin)
        throw new Error('coin not found');

      let ti = {
        address_n: path,
        prev_index: input.prevout.index,
        prev_hash: input.prevout.txid(),
        script_type: 'SPENDADDRESS',
        amount: coin.value.toString(),
      };

      this.logger.debug('prevout %s/%s', input.prevout.txid(), input.prevout.index);

      const inputTX = inputTXs[i];
      if (this.isMultisig(coin)) {
        this.logger.debug('detected multisig input');
        ti = this.trezorMultisigInput(ti);
      }

      // TODO: handle nested
      const segwit = this.isSegwit(coin);
      if (segwit) {
        // check for nested
        if (this.isNested(coin)) {
          //ti.script_type = 'SPENDP2SHWITNESS';
          this.logger.debug('detected nested segwit');
        }
        else
          ti.script_type = 'SPENDWITNESS';
      }

      this.logger.debug('using segwit %s', segwit);
      this.logger.debug('using script_type %s', ti.script_type);

      inputs.push(ti);

      const refTX = {
        hash: inputTX.txid(),
        path: paths[i],
        inputs: [],
        bin_outputs: [],
        version: inputTX.version,
        lock_time: inputTX.locktime,
      };

      // TODO: just turn into its own function
      for (const input of inputTX.inputs) {
        // TODO: script_type
        refTX.inputs.push({
          address_n: path,
          prev_index: input.prevout.index,
          prev_hash: input.prevout.txid(),
          amount: coin.value,
          sequence: input.sequence,
          script_sig: input.script.toRaw().toString('hex'),
        });
      }

      for (const output of inputTX.outputs) {
        this.logger.debug('output value: %s', output.value);
        this.logger.debug('script pubkey: %s', output.script.toString());

        refTX.bin_outputs.push({
          amount: output.value,
          script_pubkey: output.script.toRaw().toString('hex'),
        });
      }

      refTXs.push(refTX);
    }

    return [inputs, refTXs];
  }

  /*
   * checks if a coin was paid to
   * a nested address
   * see: https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki#P2WPKH_nested_in_BIP16_P2SH
   *
   * TODO: nested p2sh needs redeem?
   * @param {bcoin.Coin} - coin
   */
  isNested(coin, redeem, witness) {
    assert(coin, 'must provide coin');
    const type = coin.getType();

    if (type !== 'scripthash')
      return false;

    const raw = coin.script.raw;

    const isP2WPKH = raw[0] === opcodes.OP_HASH160
      && raw[1] === 0x14
      && raw[22] === opcodes.OP_EQUAL
      && raw.length === (1+1+20+1);

    const isP2WSH = raw[0] === 0x00
      && raw[1] === 0x14
      && raw.length === (1+1+32);

    return (isP2WPKH || isP2WSH) && (witness.length > 0);
  }

  /*
   * Checks a coin if it is segwit
   * @param coin {bcoin.Coin|bcoin.Output}
   * @returns {Boolean}
   *
   * see bcoin/lib/script/common.js
   */
  isSegwit(coin) {
    assert(coin, 'must provide coin');
    const type = coin.getType();
    this.logger.debug('scriptPubKey: %s', coin.script ? coin.script.toString() : coin.script);
    if (type === 'witnessscripthash' || type === 'witnesspubkeyhash')
      return true;
    return false;
  }

  /*
   * Checks a coin if it is multisig
   * @param coin {bcoin.Coin|bcoin.Output}
   * @returns {Boolean}
   *
   * see bcoin/lib/script/common.js
   */
  isMultisig(coin) {
    assert(coin, 'must provide coin');
    return coin.getType() === 'multisig';
  }

  /*
   * builds ledger input objects
   * @param
   * @returns {[]bledger.LedgerInput}
   *
   */
  ledgerInputs(tx, inputTXs, coins, paths, scripts) {
    const ledgerInputs = [];

    for (const [i, input] of tx.inputs.entries()) {
      this.logger.debug('input number: %s', i);

      const path = paths[i];
      this.logger.debug('using path %s', path);

      // bcoin.MTX
      let inputTX = inputTXs[i];
      if (inputTX.mutable)
        inputTX = inputTX.toTX();

      let redeem;
      if (scripts[i])
        redeem = Buffer.from(scripts[i], 'hex');
      else if (input.redeem)
        redeem = input.redeem;

      const coin = coins[i];

      const segwit = this.isSegwit(coin) || this.isNested(coin, redeem, input.witness);

      this.logger.debug('using redeem: %s', redeem ? redeem.toString('hex') : redeem);
      this.logger.debug('using segwit %s', segwit);

      const ledgerInput = new LedgerTXInput({
        witness: segwit,
        redeem,
        coin,
        path,
        index: input.prevout.index,
        tx: inputTX,
      });
      ledgerInputs.push(ledgerInput);
    }

    return ledgerInputs;
  }


  /*
   *
   */
  async getSignature(mtx, options) {
    this.ensureInitialized();

    const inputTXs = options.inputTXs || [];
    const coins = options.coins || [];
    let paths = options.paths || [];
    const scripts = options.scripts || [];
    const enc = options.env || 'hex';

    const unlock = await this.lock.lock();

    // turn to string representation
    for (let i = 0; i < paths.length; i++) {
      if (Path.isPath(paths[i]))
        paths[i] = paths[i].toString();
    }

    this.logger.debug('starting get signature');

    if (!mtx.view)
      throw new Error('mtx must have view');

    try {
      return await this._getSignature(mtx, inputTXs, coins, paths, scripts, enc);
    } catch (e) {
      this.logger.error(e.stack);
    } finally {
      unlock();
    }
  }

  /*
   *
   */
  async _getSignature(mtx, inputTXs, coins, paths, scripts, enc) {
    switch (this.vendor) {
      case vendors.LEDGER: {


        const ledgerInputs = this.ledgerInputs(mtx, inputTXs, coins, paths, scripts);
        const signatures = await this.device.getTransactionSignatures(mtx, mtx.view, ledgerInputs);

        for (const sig of signatures)
          this.logger.debug('signature: %s', sig.toString('hex'));

        if (enc === 'hex')
          return signatures.map(s => s.toString('hex'));
        return signatures;
      }

      case vendors.TREZOR: {

        // can call this.signTransaction
        // and then return the signature
        // append SIGHASH_ALL

        return [];
      }
    }
  }

  /*
   * create Hardware instance from options
   * @static
   * @param options {Object}
   * @returns Hardware
   */
  static fromOptions(options) {
    return new this(options);
  }

  /*
   * create Hardware instance from options
   *
   * @param options {Object}
   * @param options.vendor {String}
   * @param options.network {String}
   * @param options.logger {blgr.Logger}
   * @param options.logLevel {String}
   * @param options.retry {Boolean}
   * @param options.retryCount {Integer}
   */
  fromOptions(options) {
    assert(options.vendor, 'must initialize with vendor ledger or trezor');
    assert(options.vendor === 'ledger' || options.vendor === 'trezor');
    this.vendor = options.vendor;

    assert(options.network, 'must pass network');
    this.network = options.network;

    // must be blgr instance
    if (options.logger) {
      this.logger = options.logger;
    }

    if (options.logLevel)
      this.logger.setLevel(options.logLevel);

    if (options.logLevel) {
      this.logLevel = options.logLevel;
      if (!this.logger)
        this.logger = new blgr(this.logLevel);
    }

    if (options.retry) {
      assert(typeof options.retry === 'boolean');
      this.retry = true;
    }

    if (options.retryCount)
      this.retryCount = options.retryCount;

    if (options.trezordDebug) {
      assert(typeof options.trezordDebug === 'boolean');
      this.trezordDebug = options.trezordDebug;
    }
  }
}

exports.Hardware = Hardware;
