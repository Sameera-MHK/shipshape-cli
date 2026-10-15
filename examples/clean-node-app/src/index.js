import { createServer } from 'node:http';
import { greet } from './lib/greet.js';
import config from './config.js';

createServer((req, res) => {
  res.end(greet('world'));
}).listen(config.port);
