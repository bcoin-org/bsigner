'use strict';

// import stuff from src/app to export

const common = require('./common');
const DeviceManager = require('./manager/manager');
const {Path} = require('./path');
const {
  prepareSign,
  generateToken,
  prepareSignMultisig,
  guessPath,
  getKnownPaths
} = require('./app');

// classes
exports.DeviceManager = DeviceManager;
exports.Path = Path;

// app methods
exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;
exports.guessPath = guessPath;
exports.getKnownPaths = getKnownPaths;
exports.vendors = common.vendors;
