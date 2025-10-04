// Use FlatCompat to convert the legacy .eslintrc.cjs into a flat config that
// the ESLint CLI (v9+) can consume.
const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat({ baseDirectory: __dirname });
// Load the legacy config and convert it to a flat-config-compatible format.
 
const legacy = require('./.eslintrc.cjs');
module.exports = compat.config(legacy);

