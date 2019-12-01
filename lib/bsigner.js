'use strict';

// import stuff from src/app to export

const {DeviceManager} = require('../lib/device/manager');
const {Path} = require('../lib/path');
const {
  prepareSign,
  generateToken,
  prepareSignMultisig,
  guessPath,
  getKnownPaths
} = require('../lib/app');

// classes
exports.DeviceManager = DeviceManager;
exports.Path = Path;

// app methods
exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;
exports.guessPath = guessPath;
exports.getKnownPaths = getKnownPaths;
