/*!
 * manager.js - Manager example.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const LedgerDeviceManager = require('../lib/device/ledgermanager');
const TrezorDeviceManager = require('../lib/device/trezormanager');
const DeviceManager = require('../lib/device/manager');
const { vendors } = require('../lib/common');
const Logger = require('blgr');
const Network = require('bcoin/lib/protocol/network');

// 'TREZOR' | 'LEDGER' | 'GENERIC'
const MANAGER = (process.env.MANAGER || 'GENERIC').toUpperCase();
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

  if (MANAGER === 'GENERIC')
    await manager.selectDevice(VENDOR === 'ANY' ? 'LEDGER' : VENDOR);
  else
    await manager.selectDevice();

  const pubkey = await manager.getPublicKey('m/44\'/1\'/0\'');
  console.log('Public Key: ', pubkey.xpubkey(network));
  const pubkey1 = await manager.getPublicKey('m/44\'/1\'/1\'');
  console.log('Public Key: ', pubkey1.xpubkey(network));

  await manager.close();
};

(async () => {
  const network = Network.get('regtest');
  const logger = new Logger('spam');
  await logger.open();

  let manager;
  switch (MANAGER) {
    case vendors.LEDGER: {
      manager = new LedgerDeviceManager({ network, logger });
      break;
    }
    case vendors.TREZOR: {
      manager = new TrezorDeviceManager({ network, logger });
      break;
    }
    case 'GENERIC': {
      const vendor = VENDOR;
      manager = new DeviceManager({ network, logger, vendor });
      break;
    }
    default: {
      throw new Error(`Can not use ${MANAGER} as manager.`);
    }
  }

  await runDeviceManager(manager, network);
  await logger.close();
})().catch((err) => {
  console.error(err);
});
