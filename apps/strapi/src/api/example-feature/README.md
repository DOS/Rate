# Example Feature (Backend)

This is an example feature structure for the backend (Strapi) part of the application.
This feature is owned by **Cursor**.

## Structure

```
example-feature/
├── content-types/
│   └── example-feature/
│       └── schema.json    # Content type definition
├── controllers/
│   └── example-feature.ts  # API controllers
├── services/
│   └── example-feature.ts  # Business logic
├── routes/
│   └── example-feature.ts  # API routes
└── README.md              # Feature documentation
```

## API Endpoints

This feature provides the following API endpoints:

- `GET /api/example-features` - List all items with pagination
- `GET /api/example-features/:id` - Get single item
- `POST /api/example-features` - Create new item
- `PUT /api/example-features/:id` - Update item
- `DELETE /api/example-features/:id` - Delete item

## Schema

The content type includes:
- `title` (String, required)
- `description` (Text)
- `status` (Enum: draft, published, archived)
- `metadata` (JSON)

## Services

- `find()` - Find all items with filters
- `findOne(id)` - Find single item
- `create(data)` - Create new item
- `update(id, data)` - Update existing item
- `delete(id)` - Delete item

## Development

```bash
# Generate types for this content type
yarn strapi ts:generate-types

# Run only backend
yarn workspace @repo/strapi dev
```