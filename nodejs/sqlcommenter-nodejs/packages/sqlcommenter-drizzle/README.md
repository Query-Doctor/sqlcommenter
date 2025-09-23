# @query-doctor/sqlcommenter-drizzle

Drizzle sqlcommenter support for drizzle >= 0.34.0 (including 1.0.0 beta).

Only tested on Postgres, but theoretically it should be compatible with all clients supported by drizzle.

Emits the following fields into the query:

| name          | included by default? | description                                                     |
| ------------- | -------------------- | --------------------------------------------------------------- |
| db_driver     | Yes                  | The driver used to connect to the database. (Drizzle)           |
| file          | Yes                  | The file that the query was executed in.                        |
| route         | No                   | The route that the query was executed in.                       |
| method        | No                   | The http method for the request that the query was executed in. |
| anything else | No                   | Any other information that the user wants to add to the query.  |

It also emits the trace context, if available.

### Installation

```shell
npm install @query-doctor/sqlcommenter-drizzle
pnpm add @query-doctor/sqlcommenter-drizzle
```

### Usage

Simply wrap your drizzle instance with the `patchDrizzle` function.

Before:

```ts
// db/drizle.ts
import { drizzle } from "drizzle-orm/postgres-js";

const db = drizzle(process.env.DATABASE_URL);
```

After:

```ts
// db/drizle.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { patchDrizzle } from "@query-doctor/sqlcommenter-drizzle";

const db = patchDrizzle(drizzle(process.env.DATABASE_URL));
```

### Emitting route information

To include route information in the comments, patching Drizzle by itself is not enough. You need to use the `withRequestContext` function to pass along relevant information to the query comments.

You can add any arbitrary information to the request context aside from `route`, `method` and `controller`.

Here are some examples of how to use it with different frameworks:

#### Express

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-drizzle/http";

app.use((req, res, next) => {
  withRequestContext({ route: req.route.path, method: req.method }, next);
});
```

#### Hono

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-drizzle/http";
import { routePath } from "hono/route";

app.use((c, next) => {
  withRequestContext({ route: routePath(c), method: c.req.method }, next);
});
```

#### Fastify

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-drizzle/http";

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
