/*!
 * hardware.js
 * Copyright (c) 2018-2019, bcoin developers (MIT License)
 * https://github.com/bcoin-org/bsigner
 */

'use strict';

const EventEmitter = require('events');
const bledger = require('bledger');
const {LedgerBcoin,LedgerTXInput} = bledger;
const {Device} = bledger.HID;
const assert = require('bsert');
const {Lock} = require('bmutex');
const Logger = require('blgr');
const {TX} = require('bcoin');
const {opcodes} = require('bcoin/lib/script/common');
const hash160 = require('bcrypto/lib/hash160');
const secp256k1 = require('bcrypto/lib/secp256k1');

const {vendors, parsePath} = require('./common');
const {Path} = require('./path');

/*
 * Hardware Class
 * wrapper around ledger and trezor
 * hardware wallets
 *
 * TODO: implement LOCAL flag
 */
class Hardware extends EventEmitter {
  constructor(options) {
    super();

    this.initialized = false;
    this.logger = new Logger();
    this.lock = new Lock(false);
    this.device = null;
    this.retry = false;
    this.retryCount = 3;
    this.retries = 0;
    this.network = null;
    this.trezordDebug = false;

    // index devices by path
    this.devices = {
      [vendors.LEDGER]: new Map(),
      [vendors.TREZOR]: new Map()
    };

    // index devices by fingerprint
    this.fingerPrints = new Map();

    // references to each timer
    this.timers = [];

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
        case vendors.ANY:
          await this.watch(vendors.LEDGER);
          break;

        case vendors.LEDGER:
          await this.watch(vendors.LEDGER);
          break;

        case vendors.TREZOR:
          throw new Error('trezor support has been removed temporarily');

        case vendors.LOCAL:
          throw new Error('local signing is not available yet');

        default:
          throw new Error('unknown vendor type:' + this.vendor);
      }
    } catch (e) {
      this.logger.debug(e.message);
      throw e;
    }
  }

  /*
   * recurring loop of checking to see
   * if new devices have been plugged in
   * and will connect if no device is connected
   *
   */
  async watch(vendor) {
    await this.checkDevices(vendor);
    if (!this.device)
      this.trySelect({vendor});

    this.timers.push(setInterval(async () => {
      await this.checkDevices(vendor);

      if (!this.device)
        this.trySelect({vendor});
    }, 2000));
  }

  /*
   * try to select a device based on the
   * vendor
   * TODO: add select by fingerprint support
   */
  trySelect({vendor}) {
    const devices = this.devices[vendor];
    if (devices.size > 0)
      this.select({vendor});
  }

  /*
   * check the devices to see if there have
   * been any connected or disconnected,
   * index the initialized devices and
   * emit events
   */
  async checkDevices(vendor) {
    switch (vendor) {
      case vendors.LEDGER:
        await this.checkLedger();
        break;

      default:
        throw new Error(`unknown device vendor: ${vendor}`);
    }
  }

  /*
   * checks for new ledger devices
   * and emits events, will index
   * the devices by fingerprint and
   * by path
   */
  async checkLedger() {
    // returns a list of HIDDeviceInfo
    // can be uniquely identified by their path
    const detected = await Device.getDevices();
    const paths = detected.map(d => d.path);

    // known schema looks like:
    // path -> { device:ledgerbcoinapp, vendor:'ledger' }
    const known = this.devices[vendors.LEDGER];

    // remove devices from known that
    // are no longer connected
    for (const [k,v] of known) {
      if (!paths.includes(k)) {
        await v.device.close();
        known.delete(k);
        this.fingerPrints.delete(v.fingerprint);

        // need to set device to null if
        // currently selected device is disconencted
        if (v.device.devicePath === k)
          this.device = null;

        this.emit('disconnect', {
          vendor: vendors.LEDGER,
          fingerprint: v.fingerprint
        });
      }
    }

    // initialize any new devices
    // index them and emit events
    for (const d of detected) {
      if (!(known.has(d.path))) {
        try {
          const device = new Device({
            device: d,
            timeout: 1e6
          });

          await device.open();

          const ledgerBcoin = new LedgerBcoin({
            device,
            network: this.network
          });

          // get the fingerprint so we can index by fingerprint
          const data = await ledgerBcoin.getPublicKey('M');
          const compressed = secp256k1.publicKeyConvert(data.publicKey, true);
          const hash = hash160.digest(compressed);
          const fp = hash.readUInt32BE(0);
          ledgerBcoin.fingerprint = fp;

          // set device if its not set
          // so that it can be used
          // on the other side of the event
          if (!this.device)
            this.device = ledgerBcoin;

          this.emit('connect', {
            vendor: vendors.LEDGER,
            fingerprint: fp
          });

          known.set(d.path, ledgerBcoin);

          this.fingerPrints.set(fp, {
            device: ledgerBcoin,
            vendor: vendors.LEDGER
          });
        } catch(e) {
          this.logger.error(e.stack);
        }
      }
    }
  }

  /*
   *
   * the case where there are multiple of the same vendor
   * with the same fingerprint shouldn't matter because
   * its premature optimization to allow for parallel signing,
   * a device that can do the signing will be selected to
   * do the signing, it doesn't matter too much which one
   */
  async select(options) {
    const {vendor, fingerprint} = options;
    assert(vendor || fingerprint, 'must pass one of vendor or fingerprint');

    if (fingerprint) {
      const selected = this.fingerPrints.get(fingerprint);
      if (!selected)
        throw new Error('fingerprint not found');
      this.device = selected;
      // its possible to select the wrong device with
      // the same fingerprint. come up with good solution
      return;
    }

    // no fingerprint provided
    switch (vendor) {
      case vendors.LEDGER:
        this.selectLedger(options);
        break;

      case vendors.TREZOR:
        break;

      default:
        throw new Error(`trying to connect to unknown vendor: ${vendor}`);
    }
  }

  /*
   * select the first ledger device
   * TODO: add select by fingerprint support
   */
  async selectLedger(options) {
    const devices = [...this.devices[vendors.LEDGER].values()];

    if (devices.length === 0)
      throw new Error('cannot connect when no devices');

    this.device = devices[0];
  }

  async selectTrezor() {}

  /*
   * TODO: properly close this.device
   * figure out how to get trezor to not hang open
   */
  async close() {
    for (const timer of this.timers)
      clearInterval(timer);

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
    this.device = null;
  }

  /*
   * ensure the Hardware instance
   * has been initialized
   * @throws
   */
  ensureInitialized() {
    if (!this.device)
      throw new Error('device not found');
  }

  /*
   * get serialized extended public key
   * wraps Hardware.getPublicKey
   * uses this.network
   *
   * @param path {String|[]Integer}
   * @returns String
   */
  async getXPUB(path) {
    const xpub = await this.getPublicKey(path);
    return xpub.xpubkey(this.network);
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
      return false;
    } finally {
      unlock();
    }
  }

  /*
   * get public key based on vendor
   * @param path {String|[]Integer}
   * @returns bcoin.HDPublicKey
   */
  async _getPublicKey(path, getParentFingerPrint = true) {
    switch (this.vendor) {
      case vendors.LEDGER: {
        return await this.device.getPublicKey(path, getParentFingerPrint);
      }
      case vendors.TREZOR: {
        throw new Error('temporarily unsupported');
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
    if (this.vendor === vendors.TREZOR) {
      if (this.network.type === 'regtest' || this.network.type === 'simnet') {
        throw new Error('unsupported vendor '+
          `${this.vendor} with network ${this.network}`);
      }
    }

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
      return false;
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
        const ledgerInputs =
          this.ledgerInputs(tx, inputTXs, coins, paths, scripts);

        const result = await this.device.signTransaction(tx, ledgerInputs);

        /*
         * this is a lot of code just to do some debug logging
         * but its nice to see the signatures
         */
        this.logger.debug('(w)txid: %s', result.wtxid());
        for (const [i, input] of Object.entries(result.inputs)) {
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
        const [trezorInputs, refTXs] =
          this.trezorInputs(tx, inputTXs, coins, paths, scripts);

        const trezorOutputs = this.trezorOutputs(tx);

        // select proper trezor network
        let network = 'bitcoin';
        if (this.network.type === 'testnet')
          network = 'Testnet';

        const lockTime = tx.locktime;

        const response =
          await this.device.waitForSessionAndRun(async (session) => {
            // inputs, outputs, txs?, coinType
            return await session.signTx(trezorInputs, trezorOutputs,
                refTXs, network, lockTime);
          });

        // TODO: better error checking
        // expecing the type to be trezor.SignedTx
        // when it works as expected
        if (response.type !== 'trezor.SignedTx')
          throw new Error('Error signing transaction');

        const hex = response.message.serialized.serialized_tx;
        const transaction = TX.fromRaw(hex, 'hex');

        return transaction;
      }
    }

    return false;
  }

  /*
   *
   */
  trezorOutputs(mtx) {
    const outputs = [];

    for (const [i, output] of mtx.outputs.entries()) {
      this.logger.debug('output number: %s', i);

      let address;
      const segwit = this.isSegwit(output);
      if (segwit) {
        address = output.getAddress().toBech32(this.network);
        // TODO: for change output need to set scriptType
        // to 'PAYTOWITNESS' if its to address from same account xpub
        // need keyring to determine this?
      } else {
        address = output.getAddress().toBase58(this.network);
      }

      const scriptType = 'PAYTOADDRESS';
      const amount = output.value.toString();

      this.logger.debug('output address: %s', address);
      this.logger.debug('output amount: %s', amount);

      outputs.push({
        address,
        amount,
        script_type: scriptType
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
          chain_code: key.chainCode.toString('hex')
        },
        address_n: [branch, index]
      })),
      signatures: pubkeys.map(() => ''),
      m: m
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
        amount: coin.value.toString()
      };

      this.logger.debug('prevout %s/%s',
        input.prevout.txid(), input.prevout.index);

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
          // ti.script_type = 'SPENDP2SHWITNESS';
          this.logger.debug('detected nested segwit');
        } else {
          ti.script_type = 'SPENDWITNESS';
        }
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
        lock_time: inputTX.locktime
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
          script_sig: input.script.toRaw().toString('hex')
        });
      }

      for (const output of inputTX.outputs) {
        this.logger.debug('output value: %s', output.value);
        this.logger.debug('script pubkey: %s', output.script.toString());

        refTX.bin_outputs.push({
          amount: output.value,
          script_pubkey: output.script.toRaw().toString('hex')
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
    this.logger.debug('scriptPubKey: %s',
      coin.script ? coin.script.toString() : coin.script);
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

      const segwit =
        this.isSegwit(coin) || this.isNested(coin, redeem, input.witness);

      this.logger.debug('using redeem: %s',
        redeem ? redeem.toString('hex') : redeem);
      this.logger.debug('using segwit %s', segwit);

      const ledgerInput = new LedgerTXInput({
        witness: segwit,
        redeem,
        coin,
        path,
        index: input.prevout.index,
        tx: inputTX
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
    const paths = options.paths || [];
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
      return await
        this._getSignature(mtx, inputTXs, coins, paths, scripts, enc);
    } catch (e) {
      this.logger.error(e.stack);
      return false;
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
        const ledgerInputs = this.ledgerInputs(mtx, inputTXs,
          coins, paths, scripts);
        const signatures = await this.device.getTransactionSignatures(mtx,
          mtx.view, ledgerInputs);

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

    return false;
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
    if (!options.vendor)
      this.vendor = 'ANY';
    else {
      const vendor = options.vendor.toUpperCase();
      assert(vendor in vendors, 'must pass supported vendor');
      this.vendor = vendor;
    }

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
        this.logger = new Logger(this.logLevel);
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
