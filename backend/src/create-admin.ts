import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createAdmin } from './admin.js';
import { closeDatabase } from './database.js';

let hideInput = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hideInput) process.stdout.write(chunk);
    callback();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
  const email = await prompt.question('Admin email: ');
  process.stdout.write('Admin password (at least 8 characters, hidden): ');
  hideInput = true;
  const password = await prompt.question('');
  process.stdout.write('\nConfirm password (hidden): ');
  const confirmation = await prompt.question('');
  hideInput = false;
  process.stdout.write('\n');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  await createAdmin(email, password);
} catch (error) {
  // Do not log input values or database connection details.
  console.error(
    '[admin] Account creation failed. Check the email, matching passwords, and database connection.',
  );
  process.exitCode = 1;
} finally {
  prompt.close();
  await closeDatabase();
}
