import { MongoClient, type Db, type ClientSession } from 'mongodb';

let client: MongoClient | undefined;
let connection: Promise<Db> | undefined;

// Reuse the pool across warm Vercel Function invocations.
export function connectDatabase(): Promise<Db> {
  if (!connection) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is required in backend/.env.');
    client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10000 });
    connection = client
      .connect()
      .then(async (client) => {
        const database = client.db(process.env.MONGODB_DB_NAME || undefined);
        await Promise.all([
          ...['products', 'collections', 'orders', 'contacts'].map((name) =>
            database.collection(name).createIndex({ id: 1 }, { unique: true }),
          ),
          database.collection('orders').createIndex({ requestId: 1 }, { unique: true }),
          database.collection('admins').createIndex({ email: 1 }, { unique: true }),
          database.collection('sessions').createIndex({ token: 1 }, { unique: true }),
          database.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        ]);
        console.log('[database] MongoDB connected');
        return database;
      })
      .catch((error) => {
        connection = undefined;
        throw error;
      });
  }
  return connection;
}
export async function closeDatabase() {
  await client?.close();
  client = undefined;
  connection = undefined;
}
export async function getRecords<T>(table: string): Promise<T[]> {
  const database = await connectDatabase();
  return (await database
    .collection(table)
    .find({}, { projection: { _id: 0 } })
    .sort({ _id: -1 })
    .toArray()) as T[];
}
export async function getRecord<T>(
  table: string,
  id: string,
  session?: ClientSession,
): Promise<T | undefined> {
  const database = await connectDatabase();
  return (
    ((await database
      .collection(table)
      .findOne({ id }, { projection: { _id: 0 }, session })) as T) || undefined
  );
}
export async function saveRecord<T extends { id: string }>(table: string, record: T) {
  const database = await connectDatabase();
  await database.collection(table).updateOne({ id: record.id }, { $set: record }, { upsert: true });
}
export async function transaction<T>(
  callback: (database: Db, session: ClientSession) => Promise<T>,
) {
  const database = await connectDatabase();
  const session = client!.startSession();
  try {
    return await session.withTransaction(() => callback(database, session));
  } finally {
    await session.endSession();
  }
}
