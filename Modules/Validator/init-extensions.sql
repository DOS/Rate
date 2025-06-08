-- Initialize required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";

-- Test the extensions
SELECT uuid_generate_v4() as uuid_v4;
SELECT gen_random_uuid() as random_uuid;
SELECT uuid_generate_v7() as uuid_v7;
