const fs = require('fs');
let file = fs.readFileSync('src/modules/sales/SalesOrderForm.jsx', 'utf8');

// Replace \` with `
file = file.split('\\`').join('`');
// Replace \$ with $
file = file.split('\\$').join('$');

fs.writeFileSync('src/modules/sales/SalesOrderForm.jsx', file);
console.log('Fixed backticks successfully!');
