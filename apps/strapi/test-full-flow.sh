#!/bin/bash
# Load OpenAI API key from root .env
export $(grep "^OPENAI_API_KEY=" ../../.env | xargs)
export $(grep "^OPENAI_MODEL=" ../../.env | xargs)

# Run test
npx tsx src/scripts/item-seeding/test-full-flow-no-db.ts "$@"
