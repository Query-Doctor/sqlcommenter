# @query-doctor/sqlcommenter-mikroorm

SQLCommenter support for MikroORM >= 6.4.0.

Uses MikroORM's built-in `onQuery` configuration hook — no monkey-patching required.

Emits the following fields into the query:

| name          | included by default? | description                                                     |
| ------------- | -------------------- | --------------------------------------------------------------- |
| db_driver     | Yes                  | The driver used to connect to the database. (MikroORM)          |
| file          | Yes                  | The file that the query was executed in.                        |
| route         | No                   | The route that the query was executed in.                       |
| method        | No                   | The http method for the request that the query was executed in. |
| anything else | No                   | Any other information that the user wants to add to the query.  |

It also emits the trace context, if available.

### Installation

```shell
npm install @query-doctor/sqlcommenter-mikroorm
pnpm add @query-doctor/sqlcommenter-mikroorm
```

### Usage

Simply call `patchMikroORM` on your MikroORM instance after initialization.

Before:

```ts
import { MikroORM } from "@mikro-orm/core";

const orm = await MikroORM.init({
  dbName: "my-db",
  entities: [...],
});
```

After:

```ts
import { MikroORM } from "@mikro-orm/core";
import { patchMikroORM } from "@query-doctor/sqlcommenter-mikroorm";

const mikroORM = await MikroORM.init({
  dbName: "my-db",
  entities: [...],
});
const orm = patchMikroORM(mikroORM);
```

### Emitting route information

To include route information in the comments, patching MikroORM by itself is not enough. You need to use the `withRequestContext` function to pass along relevant information to the query comments.

You can add any arbitrary information to the request context aside from `route`, `method` and `controller`.

Here are some examples of how to use it with different frameworks:

#### Express

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-mikroorm/http";

app.use((req, res, next) => {
  withRequestContext({ route: req.route.path, method: req.method }, next);
});
```

#### Hono

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-mikroorm/http";
import { routePath } from "hono/route";

app.use((c, next) => {
  withRequestContext({ route: routePath(c), method: c.req.method }, next);
});
```

#### Fastify

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-mikroorm/http";

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
import { withRequestContext } from "@query-doctor/sqlcommenter-mikroorm/http";

@Injectable()
export class SqlcommenterMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    withRequestContext({ route: req.path, method: req.method }, next);
  }
}
```
