const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

// We need to bypass the fact that the modules might be ESM or need babel.
// But wait, the @lobehub/icons/es components are pre-transpiled?
// No, they are ESM or commonjs.
