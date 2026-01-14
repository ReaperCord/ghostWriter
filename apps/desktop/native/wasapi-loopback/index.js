const path = require('path');

// Try to load the native addon
let addon;
try {
    addon = require('./build/Release/wasapi_loopback.node');
} catch (e) {
    try {
        addon = require('./build/Debug/wasapi_loopback.node');
    } catch (e2) {
        console.error('Failed to load wasapi_loopback native addon:', e.message);
        console.error('Make sure to run: npm install (in native/wasapi-loopback directory)');
        throw e;
    }
}

module.exports = addon;
