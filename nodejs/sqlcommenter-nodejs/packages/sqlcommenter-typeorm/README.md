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

```ts
import { withRequestContext } from "@query-doctor/sqlcommenter-typeorm/http";

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
import { withRequestContext } from "@query-doctor/sqlcommenter-typeorm/http";

@Injectable()
export class SqlcommenterMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    withRequestContext({ route: req.path, method: req.method }, next);
  }
}
```
