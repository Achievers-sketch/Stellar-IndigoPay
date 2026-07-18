'use strict';

jest.mock('fs', () => {
  return {
    existsSync: jest.fn(() => true),
    readdirSync: jest.fn(() => [
      '001_initial_schema.sql',
      '002_add_performance_indexes.sql',
    ]),
    readFileSync: jest.fn((filePath) => {
      const s = String(filePath);
      if (s.includes('001_initial_schema.sql')) {
        return `-- UP\nCREATE TABLE a(id int);\n-- DOWN\nDROP TABLE a;`;
      }
      if (s.includes('002_add_performance_indexes.sql')) {
        return `-- UP\nCREATE TABLE b(id int);\n-- DOWN\nDROP TABLE b;`;
      }
      throw new Error(`Unexpected filePath: ${filePath}`);
    }),
  };
});

jest.mock('crypto', () => {
  return {
    createHash: jest.fn(() => ({
      update: () => ({
        digest: () => 'deadbeef',
      }),
    })),
  };
});

jest.mock('../../src/db/pool', () => {
  const clientMock = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const poolMock = {
    connect: jest.fn(() => Promise.resolve(clientMock)),
  };

  // expose for assertions
  poolMock.__client = clientMock;

  return poolMock;
});

const pool = require('../../src/db/pool');

beforeEach(() => {
  jest.clearAllMocks();

  const clientMock = pool.__client;
  clientMock.query.mockImplementation(async (sql) => {
    if (typeof sql !== 'string') return { rows: [] };

    if (sql.includes('CREATE TABLE IF NOT EXISTS _migrations')) return { rows: [] };

    if (sql.startsWith('SELECT id, name, applied_at, checksum')) return { rows: [] };

    return { rows: [] };
  });
});

describe('migration runner (SQL)', () => {
  test('applies pending migrations and records history entries', async () => {
    const { runMigrations } = require('../../src/db/migrate');

    // Seed DB writes will fail because this is a unit test with mocked client.
    // We only need the migrations portion, so mock seedDatabase by stubbing
    // required seed modules: easiest is to let seedDatabase execute harmlessly.
    // The migration runner will still execute seed queries; our default client.query returns {rows:[]}
    await runMigrations();

    const clientMock = pool.__client;
    const inserts = clientMock.query.mock.calls.filter((c) =>
      String(c[0]).includes('INSERT INTO _migrations'),
    );

    expect(inserts).toHaveLength(2);

    const names = inserts.map((c) => c[1][0]);
    expect(names).toEqual(['001_initial_schema.sql', '002_add_performance_indexes.sql']);
  });
});

