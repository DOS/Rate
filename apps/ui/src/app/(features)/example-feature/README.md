# Example Feature (Frontend)

This is an example feature structure for the frontend (UI) part of the application.
This feature is owned by **Claude Code**.

## Structure

```
example-feature/
├── components/        # React components
├── hooks/            # Custom React hooks
├── actions/          # Server actions (Next.js)
├── types/            # TypeScript types specific to this feature
├── page.tsx          # Main page component
├── layout.tsx        # Layout wrapper (optional)
└── README.md         # Feature documentation
```

## API Contract

This feature consumes the following API endpoints from `@repo/shared-data`:

- `GET /api/example-feature` - List items
- `POST /api/example-feature` - Create item
- `PUT /api/example-feature/:id` - Update item
- `DELETE /api/example-feature/:id` - Delete item

## Components

- `ExampleList` - Displays list of items
- `ExampleForm` - Form for creating/editing items
- `ExampleCard` - Individual item display

## Hooks

- `useExampleData` - Fetches and manages example data
- `useExampleMutation` - Handles create/update/delete operations

## Development

```bash
# Run only this feature's tests
yarn test --filter=example-feature

# Build only UI app
yarn build:ui
```