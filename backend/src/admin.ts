import { randomBytes, scryptSync } from 'node:crypto';
import { z } from 'zod';
import { connectDatabase } from './database.js';

export async function createAdmin(email: string, password: string) {
  const input = z
    .object({
      email: z.email().transform((value) => value.toLowerCase()),
      password: z.string().min(8).max(200),
    })
    .parse({ email: email.trim(), password });
  const database = await connectDatabase();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(input.password, salt, 64).toString('hex');
  // Creating an account again must never reset its existing password.
  const result = await database.collection('admins').updateOne(
    { email: input.email },
    {
      $setOnInsert: {
        email: input.email,
        salt,
        passwordHash,
        role: 'admin',
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  console.log(
    result.upsertedCount
      ? '[admin] Account created in MongoDB.'
      : '[admin] Account already exists; password preserved.',
  );
}
