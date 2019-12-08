/*!
 * manager.js - Manager example.
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 */

'use strict';

const LedgerDeviceManager = require('../lib/device/ledgermanager');
const DeviceManager = require('../lib/device/manager');
const { vendors } = require('../lib/common');
const Logger = require('blgr');
const Network = require('bcoin/lib/protocol/network');

// Example 1.
// Using LedgerDeviceManager directly.
const runLedgerDeviceManager = async (logger, network) => {
  const ledgerDeviceManager = new LedgerDeviceManager({ network, logger });

  ledgerDeviceManager.on('select', (device) => {
    console.log('Select', device.key, device.handle);
  });

  ledgerDeviceManager.on('deselect', (device) => {
    console.log('Deselect', device.key, device.handle);
  });

  ledgerDeviceManager.on('connect', (device) => {
    console.log('Connect:', device.key, device.handle);

    ledgerDeviceManager.selectDevice(device);
  });

  ledgerDeviceManager.on('disconnect', (device) => {
    console.log('Disconnect:', device.key, device.handle);
  });

  await ledgerDeviceManager.open();
  await ledgerDeviceManager.selectDevice();

  const pubkey = await ledgerDeviceManager.getPublicKey('m/44\'/1\'/0\'');
  console.log('Public Key: ', pubkey.xpubkey(network));

  await ledgerDeviceManager.close();
};

// Example 2.
// Using generic DeviceManager.
const runDeviceManager = async (logger, network) => {
  const deviceManager = new DeviceManager({ network, logger });

  deviceManager.on('select', (device) => {
    console.log('Select', device.vendor, device.key, device.handle);
  });

  deviceManager.on('deselect', (device) => {
    console.log('Deselect', device.vendor, device.key, device.handle);
  });

  deviceManager.on('connect', (device) => {
    console.log('Connect:', device.vendor, device.key, device.handle);

    // We could do two things:
    //  1. overload first parameter to accept STRING or Device type and
    //    act accordingly.
    //  2. Ignore first parameter if device is present and use vendor
    //    from the device (device.vendor)
    //  3. Check vendor === device.vendor and throw if they don't match
    //    but there are no benefits with this, you will just use
    //    selectDevice(device.vendor, device);

    deviceManager.selectDevice(device.vendor, device);
  });

  deviceManager.on('disconnect', (device) => {
    console.log('Disconnect:', device.vendor, device.key, device.handle);
  });

  await deviceManager.open();
  await deviceManager.selectDevice(vendors.LEDGER);

  const pubkey = await deviceManager.getPublicKey('m/44\'/1\'/0\'');
  console.log('Public Key: ', pubkey.xpubkey(network));

  await deviceManager.close();
};

(async () => {
  const network = Network.get('regtest');
  const logger = new Logger('spam');
  await logger.open();

  console.log('-- ledger device manager --');
  await runLedgerDeviceManager(logger, network);
  console.log('-- generic device manager --');
  await runDeviceManager(logger, network);

  await logger.close();
})().catch((err) => {
  console.error(err);
});
