export default ({ env }: any) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', 'localhost'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'rate'),
      user: env('DATABASE_USERNAME', 'joy'),
      password: env('DATABASE_PASSWORD', 'joy123456'),
      schema: env('DATABASE_SCHEMA', 'public'),
      ssl: env.bool('DATABASE_SSL', false),
    },
    pool: {
      min: env.int('DATABASE_POOL_MIN', 2),
      max: env.int('DATABASE_POOL_MAX', 10),
    },
    // Prevent aggressive schema sync in development
    acquireConnectionTimeout: 60000,
    debug: false,
  },
  // Disable auto-migration in development
  settings: {
    forceMigration: false,
    runMigrations: false,
  },
});