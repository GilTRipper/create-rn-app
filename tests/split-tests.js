// Temporary script to help split tests
const fs = require('fs');
const originalFile = fs.readFileSync('e2e.test.js', 'utf8');
console.log(`Total lines: ${originalFile.split('\n').length}`);
