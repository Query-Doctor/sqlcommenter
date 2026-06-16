# @query-doctor/sqlcommenter-prisma

Prisma sqlcommenter support for Prisma >= 5.4.0, via driver adapter wrapping.

Only tested on Postgres, but theoretically it should be compatible with any database reached through a Prisma driver adapter.

Emits the following fields into the query:

| name          | included by default? | description                                                     |
| ------------- | -------------------- | --------------------------------------------------------------- |
| db_driver     | Yes                  | The driver used to connect to the database. (Prisma)            |
| file          | Yes                  | The file that the query was executed in.                        |
| route         | No                   | The route that the query was executed in.                       |
| method        | No                   | The http method for the request that the query was executed in. |
| anything else | No                   | Any other information that the user wants to add to the query.  |

It also emits the trace context, if available.

### Installation

```shell
npm install @query-doctor/sqlcommenter-prisma
pnpm add @query-doctor/sqlcommenter-prisma
```

This package works through Prisma's [driver adapters](https://www.prisma.io/docs/orm/overview/databases/database-drivers), so it requires a driver adapter (e.g. `@prisma/adapter-pg`) and `previewFeatures = ["driverAdapters"]` enabled in your schema (not required on Prisma 6+, where driver adapters are stable).

### Usage

Two pieces work together:

1. `wrapAdapter` (or `wrapAdapterFactory`) appends the comments to every query that passes through the driver adapter.
2. `sqlcommenterExtension` captures the call site (`file`) of each query before it crosses Prisma's query-engine boundary.

Before:

```ts
// db/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
```

After:

```ts
// db/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { wrapAdapterFactory, sqlcommenterExtension } from "@query-doctor/sqlcommenter-prisma";

const adapter = wrapAdapterFactory(new PrismaPg({ connectionString: process.env.DATABASE_URL }));
export const prisma = new PrismaClient({ adapter }).$extends(sqlcommenterExtension());
```

> On Prisma 5, the driver adapter implements `SqlDriverAdapter` directly rather than a factory — use `wrapAdapter(new PrismaPg(pool))` instead of `wrapAdapterFactory`.

The `sqlcommenterExtension()` is optional. Without it queries are still commented, but the `file` tag (the call site) will be omitted.

### Emitting route information

To include route information in the comments, wrapping the adapter by itself is not enough. You need to use the `withRequestContext` function to pass along relevant information to the query comments.

You can add any arbitrary information to the request context aside from `route`, `method` and `controller`.

Here are some examples of how to use it with different frameworks:

#### Express

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-prisma/http";

app.use((req, res, next) => {
  withRequestContext({ route: req.route.path, method: req.method }, next);
});
```

#### Hono

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-prisma/http";
import { routePath } from "hono/route";

app.use((c, next) => {
  withRequestContext({ route: routePath(c), method: c.req.method }, next);
});
```

#### Fastify

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-prisma/http";

app.addHook("onRequest", (request, _, done) => {
  withRequestContext(
    {
      route: request.routerPath,
      method: request.method,
    },
    done
  );
});
```

#### NestJS

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-prisma/http";

@Injectable()
export class SqlcommenterMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    withRequestContext({ route: req.path, method: req.method }, next);
  }
}
```
