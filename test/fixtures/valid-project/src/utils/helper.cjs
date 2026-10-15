const path = require('path');
const { add } = require('./math');
const env = process.env.NODE_ENV;
module.exports.helper = () => path.join(String(add), String(env));
