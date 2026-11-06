const path = require('path');
const base = require('../tailwind.config.js');
// the Marvell copy builds its own styles from its own source
module.exports = { ...base, content: [path.join(__dirname, 'src/**/*.{js,jsx}')] };
