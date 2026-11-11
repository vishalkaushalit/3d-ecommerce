import type { Collection, Product } from '../../shared/types.js';
import { connectDatabase, closeDatabase } from './database.js';

export async function seedDatabase() {
  const database = await connectDatabase();
  const collections: Collection[] = [
    {
      id: 'home-kit',
      name: 'The Home Collection',
      description:
        'Our colors. Our country. The iconic red jersey, made for every generation of Garuda.',
      color: '#a72227',
    },
    {
      id: 'goalkeeper-kit',
      name: 'Between the Posts',
      description:
        'Stand your ground. The goalkeeper collection brings a different kind of confidence.',
      color: '#d8b345',
    },
  ];
  const players = [
    ['Dean James', 'JAMES', '21'],
    ['Thom Haye', 'HAYE', '19'],
    ['Ole Romeny', 'ROMENY', '10'],
    ['Rizky Ridho', 'RIDHO', '5'],
    ['Maarten Paes', 'PAES', '12'],
    ['Emil Audero', 'AUDERO', '1'],
    ['Diks', 'DIKS', '2'],
    ['Markx', 'MARKX', '3'],
    ['Amat', 'AMAT', '4'],
    ['Pratama', 'PRATAMA', '6'],
    ['Vikri', 'VIKRI', '7'],
    ['Vickery', 'VICKERY', '8'],
    ['Baker', 'BAKER', '9'],
    ['Oratmangoen', 'ORATMANGOEN', '11'],
    ['Winata', 'WINATA', '13'],
    ['Pelupessy', 'PELUPESSY', '14'],
    ['Hannan', 'HANNAN', '15'],
    ['Pattynama', 'PATTYNAMA', '16'],
    ['Verdonk', 'VERDONK', '17'],
    ['Jenner', 'JENNER', '18'],
    ['Baggott', 'BAGGOTT', '20'],
    ['Tjoe-A-On', 'TJOE-A-ON', '22'],
    ['Hubner', 'HUBNER', '23'],
  ];
  for (const collection of collections)
    await database
      .collection('collections')
      .updateOne({ id: collection.id }, { $setOnInsert: collection }, { upsert: true });
  for (const [name, player, number] of players) {
    const isGoalkeeper = ['1', '12', '13'].includes(number);
    const position: Product['position'] = isGoalkeeper
      ? 'GK'
      : ['2', '3', '4', '5', '6', '16', '20', '21', '22', '23'].includes(number)
        ? 'DEF'
        : ['8', '9', '10'].includes(number)
          ? 'FWD'
          : 'MID';
    const product: Product = {
      id: name.toLowerCase().replaceAll(' ', '-'),
      name: `${name} ${!isGoalkeeper ? 'Home' : 'Goalkeeper'} Jersey`,
      collectionId: !isGoalkeeper ? 'home-kit' : 'goalkeeper-kit',
      description:
        'A little piece of the game. The Indonesia 2026 jersey features the Garuda crest, textured fabric, and player detailing. Explore every angle in our interactive 3D view.',
      price: !isGoalkeeper ? 89 : 95,
      color: !isGoalkeeper ? '#a72227' : '#168a9c',
      kit: !isGoalkeeper ? 'home' : 'gk',
      player,
      number,
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      stock: 25,
      featured: true,
      position,
    };
    await database
      .collection('products')
      .updateOne({ id: product.id }, { $setOnInsert: product }, { upsert: true });
    await database
      .collection('products')
      .updateOne(
        { id: product.id, position: { $exists: false } },
        { $set: { position, color: product.color } },
      );
  }

  console.log('[seed] Store collections and products are ready. Existing records were preserved.');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    await seedDatabase();
  } catch (error) {
    console.error('[seed] Failed:', error instanceof Error ? error.name : 'Unknown error');
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
