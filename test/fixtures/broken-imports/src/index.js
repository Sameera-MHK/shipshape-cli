import express from 'express';
import { a } from './lib/a';
import { missing } from './lib/missing';
export * from './nowhere.js';
const b = require('./lib/b');
const lazy = import('./lazy-missing');
console.log(express, a, missing, b, lazy);
