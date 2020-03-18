/*!
 * manager.js - Manager example.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const {Signer} = require('../lib/bsigner');
const Logger = require('blgr');
const Network = require('bcoin/lib/protocol/network');

// 'TREZOR' | 'LEDGER' | 'MEMORY'
const VENDOR = (process.env.VENDOR || 'ANY').toUpperCase();

const runDeviceManager = async (manager, network) => {
  manager.on('select', (device) => {
    console.log('Select', device.vendor, device.key, device.handle);
  });

  manager.on('deselect', (device) => {
    console.log('Deselect', device.vendor, device.key, device.handle);
  });

  manager.on('connect', (device) => {
    console.log('Connect:', device.vendor, device.key, device.handle);

    manager.selectDevice(device);
  });

  manager.on('disconnect', (device) => {
    console.log('Disconnect:', device.vendor, device.key, device.handle);
  });

  await manager.open();
  const device = await manager.selectDevice(VENDOR);
  await device.open();

  const pubkey = await manager.getPublicKey('m/44\'/1\'/0\'');
  console.log('Public Key: ', pubkey.xpubkey(network));
  const xpubkey = await manager.getXPUB('m/44\'/1\'/0\'');
  console.log('Public Key: ', xpubkey);

  await device.close();
  await manager.close();
};

(async () => {
  const network = Network.get('regtest');
  const logger = new Logger('spam');
  await logger.open();

  const manager = new Signer({
    network,
    logger,
    vendor: VENDOR
  });

  await runDeviceManager(manager, network);
  await logger.close();
})().catch((err) => {
  console.error(err);
});
