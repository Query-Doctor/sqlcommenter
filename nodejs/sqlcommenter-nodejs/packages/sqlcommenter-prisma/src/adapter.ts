import {
  queryContextAls,
  requestContextAls,
  bridgedQueryContext,
  bridgedRequestContext,
} from "./als.js";
import { alreadyHasComment, serializeTags, type Tag } from "./sqlcommenter.js";
import { pushW3CTraceContext } from "./tracing.js";

const SQLCOMMENTER_ARRAY_ELEM_DELIMITER = ";";

const WellKnownFields = {
  dbDriver: "db_driver",
  file: "file",
} as const;

/**
 * Builds the sqlcommenter tag string from the current ALS context,
 * falling back to bridged context when ALS is unavailable (e.g. after
 * crossing Prisma's WASM engine boundary).
 */
function buildComment(): string {
  const queryContext = queryContextAls.getStore() ?? bridgedQueryContext;
  const requestContext = requestContextAls.getStore() ?? bridgedRequestContext;

  const tags: Tag[] = [[WellKnownFields.dbDriver, "prisma"]];

  pushW3CTraceContext(tags);

  if (queryContext && queryContext.queryStack.length > 0) {
    tags.push([
      WellKnownFields.file,
      queryContext.queryStack.join(SQLCOMMENTER_ARRAY_ELEM_DELIMITER),
    ]);
  }

  if (requestContext) {
    for (const key in requestContext) {
      tags.push([key, String(requestContext[key])]);
    }
  }

  return serializeTags(tags);
}

/**
 * Minimal type for the query params passed to queryRaw/executeRaw.
 * Compatible with @prisma/driver-adapter-utils SqlQuery.
 */
interface QueryParams {
  sql: string;
  args?: unknown[];
}

/**
 * Minimal type for the result returned by queryRaw.
 * Compatible with @prisma/driver-adapter-utils SqlResultSet.
 */
interface QueryResult {
  columnNames: string[];
  columnTypes: string[];
  rows: unknown[][];
  lastInsertId?: string;
}

/**
 * Minimal interface for a Prisma transaction.
 * Compatible with @prisma/driver-adapter-utils Transaction.
 */
interface Transaction {
  queryRaw(params: QueryParams): Promise<QueryResult>;
  executeRaw(params: QueryParams): Promise<number>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Minimal interface for a Prisma SQL driver adapter.
 * Compatible with @prisma/driver-adapter-utils SqlDriverAdapter.
 */
interface SqlDriverAdapter {
  queryRaw(params: QueryParams): Promise<QueryResult>;
  executeRaw(params: QueryParams): Promise<number>;
  startTransaction(isolationLevel?: string): Promise<Transaction>;
}

function appendComment(params: QueryParams): QueryParams {
  if (alreadyHasComment(params.sql)) {
    return params;
  }
  const comment = buildComment();
  if (!comment) {
    return params;
  }
  return { ...params, sql: params.sql + comment };
}

function wrapTransaction(tx: Transaction): Transaction {
  return {
    queryRaw(params: QueryParams) {
      return tx.queryRaw(appendComment(params));
    },
    executeRaw(params: QueryParams) {
      return tx.executeRaw(appendComment(params));
    },
    commit() {
      return tx.commit();
    },
    rollback() {
      return tx.rollback();
    },
  };
}

/**
 * Wraps a Prisma driver adapter to automatically append sqlcommenter tags
 * to every SQL query that passes through it.
 *
 * Monkey-patches the adapter in-place to preserve object identity, which
 * Prisma's error registry relies on.
 *
 * Usage:
 *   const adapter = wrapAdapter(new PrismaPg(pool))
 *   const prisma = new PrismaClient({ adapter })
 */
export function wrapAdapter<T extends SqlDriverAdapter>(adapter: T): T {
  const origQueryRaw = adapter.queryRaw.bind(adapter);
  const origExecuteRaw = adapter.executeRaw.bind(adapter);
  const origStartTx = adapter.startTransaction.bind(adapter);

  adapter.queryRaw = function (params: QueryParams) {
    return origQueryRaw(appendComment(params));
  };

  adapter.executeRaw = function (params: QueryParams) {
    return origExecuteRaw(appendComment(params));
  };

  adapter.startTransaction = async function (isolationLevel?: string) {
    const tx = await origStartTx(isolationLevel);
    return wrapTransaction(tx);
  };

  return adapter;
}

/**
 * Minimal interface for a Prisma SQL driver adapter factory.
 * Compatible with @prisma/driver-adapter-utils SqlDriverAdapterFactory.
 *
 * In Prisma 6+, PrismaPg implements this factory interface rather than
 * SqlDriverAdapter directly. Call connect() to get a SqlDriverAdapter.
 */
interface SqlDriverAdapterFactory {
  connect(): Promise<SqlDriverAdapter>;
}

/**
 * Wraps a Prisma driver adapter factory (e.g. PrismaPg in Prisma 6+) so that
 * every connection returned by connect() is automatically instrumented with
 * sqlcommenter tags.
 *
 * Usage:
 *   const adapter = wrapAdapterFactory(new PrismaPg(pool))
 *   const prisma = new PrismaClient({ adapter })
 */
export function wrapAdapterFactory<T extends SqlDriverAdapterFactory>(factory: T): T {
  const origConnect = factory.connect.bind(factory);

  factory.connect = async function () {
    const connection = await origConnect();
    return wrapAdapter(connection);
  };

  return factory;
}
