# @query-doctor/sqlcommenter-typeorm

TypeORM sqlcommenter support for TypeORM >= 0.3.0.

Emits the following fields into the query:

| name          | included by default? | description                                                     |
| ------------- | -------------------- | --------------------------------------------------------------- |
| db_driver     | Yes                  | The driver used to connect to the database. (TypeORM)           |
| file          | Yes                  | The file that the query was executed in.                        |
| route         | No                   | The route that the query was executed in.                       |
| method        | No                   | The http method for the request that the query was executed in. |
| anything else | No                   | Any other information that the user wants to add to the query.  |

It also emits the trace context, if available.

### Installation

```shell
npm install @query-doctor/sqlcommenter-typeorm
pnpm add @query-doctor/sqlcommenter-typeorm
```

### Usage

Simply wrap your TypeORM DataSource with the `patchTypeORM` function.

Before:

```ts
// db/data-source.ts
import { DataSource } from "typeorm";

const dataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
});
```

After:

```ts
// db/data-source.ts
import { DataSource } from "typeorm";
import { patchTypeORM } from "@query-doctor/sqlcommenter-typeorm";

const dataSource = patchTypeORM(new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
}));
```

### Emitting route information

To include route information in the comments, patching TypeORM by itself is not enough. You need to use the `withRequestContext` function to pass along relevant information to the query comments.

You can add any arbitrary information to the request context aside from `route`, `method` and `controller`.

Here are some examples of how to use it with different frameworks:

#### Express

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-typeorm/http";

app.use((req, res, next) => {
  withRequestContext({ route: req.route.path, method: req.method }, next);
});
```

#### Hono

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-typeorm/http";
import { routePath } from "hono/route";

app.use((c, next) => {
  withRequestContext({ route: routePath(c), method: c.req.method }, next);
});
```

#### Fastify

The recommended way is the first-party plugin, which wires everything correctly:

```ts
import { sqlcommenterFastify } from "@query-doctor/sqlcommenter-typeorm/fastify";

// Register it BEFORE any plugin whose hooks issue queries (e.g. auth), so the context
// is already open when those hooks run.
await app.register(sqlcommenterFastify);
await app.register(authPlugin);
```

It hooks `onRequest`, so it tags queries from the **entire request lifecycle** — including queries
issued in other plugins' `onRequest`/`preHandler` hooks — not just the route handler. Pass
`context` to add extra fields:

```ts
await app.register(sqlcommenterFastify, {
  context: (request) => ({ controller: "items" }),
});
```

##### Doing it manually

If you'd rather wire it yourself with `withRequestContext`, two things are easy to get wrong:

- **Register the hook globally with [`fastify-plugin`](https://github.com/fastify/fastify-plugin).**
  A plain `app.register(plugin)` encapsulates the `onRequest` hook, so it silently does **not**
  apply to routes registered in the parent scope — you get no `route`/`method` tags and no error.
- **Hook `onRequest` (not the route handler), registered before any plugin whose hooks issue
  queries** (e.g. an auth plugin that resolves a session in its own `onRequest`/`preHandler`).
  Wrapping only the handler misses those earlier queries.

```ts
import fp from "fastify-plugin";
import { withRequestContext } from "@query-doctor/sqlcommenter-typeorm/http";

const sqlcommenter = fp((app, _opts, done) => {
  app.addHook("onRequest", (request, _reply, next) => {
    withRequestContext(
      {
        // `routerPath` was removed in Fastify v5; `routeOptions.url` is the matched route pattern.
        route: request.routeOptions?.url ?? request.url,
        method: request.method,
      },
      next
    );
  });
  done();
});

await app.register(sqlcommenter); // before auth, etc.
```

#### NestJS

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-typeorm/http";

@Injectable()
export class SqlcommenterMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    withRequestContext({ route: req.path, method: req.method }, next);
  }
}
```
