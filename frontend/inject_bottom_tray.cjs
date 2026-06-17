const fs = require('fs');

let file = fs.readFileSync('src/modules/sales/SalesOrderForm.jsx', 'utf8');

const startMarker = '{/* Accordion: Trazabilidad */}';
const endMarker = '{/* Footer with Totals */}';

const startIndex = file.indexOf(startMarker);
const endIndex = file.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found!");
    process.exit(1);
}

// 1. Read pristine bottomTray from refactor.js
const refactorFile = fs.readFileSync('refactor.js', 'utf8');
const trayMatch = refactorFile.match(/const bottomTray = `([\s\S]*?)`;/);
let pristineTray = trayMatch[1];

// 2. Remove backslashes from pristineTray
pristineTray = pristineTray.split('\\`').join('`');
pristineTray = pristineTray.split('\\$').join('$');

// 3. Inject it! We need to close rightCol and bodyTwoColumns BEFORE bottomTray
const injection = '              </div>\n          </div>\n\n' + pristineTray + '\n\n          ' + endMarker;

file = file.substring(0, startIndex) + injection + file.substring(endIndex + endMarker.length);

fs.writeFileSync('src/modules/sales/SalesOrderForm.jsx', file);
console.log('Successfully injected bottomTray and removed old accordions!');
