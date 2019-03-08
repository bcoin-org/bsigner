'use strict';

// import stuff from src/app to export

const {Hardware} = require('../src/hardware');
const {Path} = require('../src/path');
const {
  prepareSign,
  generateToken,
  prepareSignMultisig,
  guessPath
} = require('../src/app');

// classes
exports.Hardware = Hardware;
exports.Path = Path;

// app methods
exports.prepareSign = prepareSign;
exports.prepareSignMultisig = prepareSignMultisig;
exports.generateToken = generateToken;
exports.guessPath = guessPath;
