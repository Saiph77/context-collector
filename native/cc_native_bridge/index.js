'use strict';

try {
  module.exports = require('node-gyp-build')(__dirname);
} catch {
  module.exports = require('./build/Release/cc_native_bridge.node');
}
