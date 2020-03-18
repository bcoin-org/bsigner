'use strict';

// import stuff from src/app to export

const common = require('./common');
const Signer = require('./signer');
const {Path} = require('./path');
const {InputData} = require('./inputData');
const {
  prepareSign,
  generateToken,
  prepareSignMultisig,
  guessPath,
  getKnownPaths
} = require('./app');

// classes
exports.Signer = Signer;
exports.Path = Path;
exports.InputData = InputData;

// app methods
exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;
exports.guessPath = guessPath;
exports.getKnownPaths = getKnownPaths;
exports.vendors = common.vendors;
