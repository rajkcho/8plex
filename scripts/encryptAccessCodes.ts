import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const accessCodes = ['ottawa', 'toronto', 'calgary', 'edmonton'];
const saltRounds = 10;

const hashPromises = accessCodes.map(code => bcrypt.hash(code, saltRounds));

Promise.all(hashPromises).then(hashes => {
  const hashedCodes = hashes.join('\n');
  fs.writeFileSync(path.join(__dirname, '..', 'access-codes.enc'), hashedCodes);
  console.log('Access codes encrypted and saved to access-codes.enc');
});
