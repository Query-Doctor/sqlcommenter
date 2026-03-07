# Prisma SQLCommenter Demo

A full-stack demo app (Express + React) showing how to use Prisma 7's built-in SQLCommenter support to annotate every SQL query with contextual metadata — source file, HTTP route, request method, model, and action.

The app is a project/issue tracker (like a mini Linear) that generates a variety of OLTP queries: CRUD, aggregations, filtering, pagination, and batch operations.

## Tags produced

Every query gets a SQL comment like:

```sql
SELECT ... FROM "Issue" WHERE ...
/*action='findMany',db_driver='prisma',file='server/routes/issues.ts:36:18',method='GET',model='Issue',route='/api/issues'*/
```

| Tag         | Source                                    |
| ----------- | ----------------------------------------- |
| `db_driver` | Custom `SqlCommenterPlugin`               |
| `model`     | Custom `SqlCommenterPlugin` (from context)|
| `action`    | Custom `SqlCommenterPlugin` (from context)|
| `route`     | `withQueryTags` middleware (ALS)          |
| `method`    | `withQueryTags` middleware (ALS)          |
| `file`      | Proxy-based stack capture at call site    |

## Setup

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Install dependencies
npm install

# Run migrations and seed
npx prisma migrate dev
npm run db:seed

# Start dev server (Express + Vite)
npm run dev
```

The app runs at http://localhost:5173 (frontend) with the API on http://localhost:3456.

## How the `file` tag works

Prisma uses lazy `PrismaPromise` objects — the query doesn't execute at `prisma.issue.findMany()` but later when `.then()` is called by `await`. By that point, user code is no longer on the call stack, so the `SqlCommenterPlugin` can't capture the source file automatically.

This demo solves it by proxying each `prisma.<model>.<method>()` call to:

1. Capture the stack trace at call time (where user code IS on the stack)
2. Extract the file path, line, and column from the first application frame
3. Return a custom thenable that wraps execution inside `withMergedQueryTags({ file })`, merging the file tag with existing route/method tags from the Express middleware

See `server/db.ts` for the implementation.
