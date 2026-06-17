import fs from 'fs';
let file = fs.readFileSync('src/modules/sales/SalesOrderForm.jsx', 'utf8');

// 1. Fix the malformed empty state ending and remove the mangled tray
const brokenStart = "                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>Buscá un producto para agregarlo a la orden</div>";
const brokenEnd = "{/* Columna Derecha: Panel Lateral Administrativo */}";

const fixedEmptyState = brokenStart + "\n                        </div>\n                      )}\n                  </div>\n              </div>\n\n              " + brokenEnd;

file = file.substring(0, file.indexOf(brokenStart)) + fixedEmptyState + file.substring(file.indexOf(brokenEnd) + brokenEnd.length);

// 2. Read bottomTray from refactor.js
const refactorFile = fs.readFileSync('refactor.js', 'utf8');
const trayMatch = refactorFile.match(/const bottomTray = `([\s\S]*?)`;/);
const pristineTray = trayMatch[1];

// 3. Inject bottomTray and fix missing closing tags before Footer
const footerTarget = "{/* Footer with Totals */}";
const properTrayInjection = "              </div>\n          </div>\n\n" + pristineTray + "\n\n          " + footerTarget;

file = file.replace(footerTarget, properTrayInjection);

fs.writeFileSync('src/modules/sales/SalesOrderForm.jsx', file);
console.log('Fixed SalesOrderForm.jsx successfully!');
