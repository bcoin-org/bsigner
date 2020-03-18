/*!
 * custom.js - Inspect for node.js
 * Copyright (c) 2019, Nodari Chkuaselidze (MIT License)
 * https://github.com/bcoin-org/bsigner
 */

'use strict';

const {inspect} = require('util');

exports.custom = inspect.custom || 'inspect';
