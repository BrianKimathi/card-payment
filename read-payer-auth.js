// Simple helper script to read and dump the contents of payer-auth.pdf
// Usage (from project root on Windows PowerShell):
//   cd cybersource
//   npm install pdf-parse
//   node read-payer-auth.js

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function main() {
  try {
    const pdfPath = path.resolve(__dirname, 'payer-auth.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.error(`payer-auth.pdf not found at: ${pdfPath}`);
      process.exit(1);
    }

    console.log('Reading PDF:', pdfPath);
    const dataBuffer = fs.readFileSync(pdfPath);

    const data = await pdfParse(dataBuffer);

    console.log('========== PDF METADATA ==========');
    console.log(JSON.stringify(data.info || {}, null, 2));
    console.log('\n========== PDF TEXT (FULL) ==========');
    console.log(data.text);
  } catch (err) {
    console.error('Error reading payer-auth.pdf:', err);
    process.exit(1);
  }
}

main();


