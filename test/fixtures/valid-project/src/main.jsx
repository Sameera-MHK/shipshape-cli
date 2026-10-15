import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Button from './components/Button';
import { add } from './utils/math.js';
import config from './data/config.json';
import template from './data/template.txt?raw';
export * from './utils';
export { helper } from './utils/helper';

const lazy = () => import('./App.jsx');
const port = process.env.PORT;
const apiUrl = import.meta.env.VITE_API_URL;
const mode = import.meta.env.MODE;

createRoot(document.getElementById('root')).render(<App button={Button} />);
console.log(add, config, template, lazy, port, apiUrl, mode);
