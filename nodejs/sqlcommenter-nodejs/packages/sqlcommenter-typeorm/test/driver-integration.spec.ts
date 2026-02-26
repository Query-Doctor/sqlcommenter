import { test } from "node:test";
import assert from "node:assert";
import { DataSource, EntitySchema } from "typeorm";
import { patchTypeORM } from "../src/index.js";

const UserEntity = new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: { type: Number, primary: true, generated: true },
    name: { type: String },
  },
});

function createDataSource() {
  return new DataSource({
    type: "sqljs",
    entities: [UserEntity],
    synchronize: true,
    logging: false,
  });
}

function interceptQueries(dataSource: DataSource): string[] {
  const executedQueries: string[] = [];
  const db = (dataSource.driver as any).databaseConnection;
  const originalPrepare = db.prepare.bind(db);
  db.prepare = function (sql: string) {
    executedQueries.push(sql);
    return originalPrepare(sql);
  };
  return executedQueries;
}

test("tags appended through Repository.find()", async () => {
  const dataSource = patchTypeORM(createDataSource());
  await dataSource.initialize();

  // Intercept AFTER synchronize to only capture our queries
  const executedQueries = interceptQueries(dataSource);

  try {
    const repo = dataSource.getRepository("User");
    await repo.find();

    const taggedQuery = executedQueries.find(
      (q) => q.includes("users") && q.includes("db_driver"),
    );
    assert.ok(
      taggedQuery,
      `Expected a tagged query via Repository.find(), got: ${executedQueries.join(", ")}`,
    );
    assert.match(taggedQuery!, /db_driver='typeorm'/);
  } finally {
    await dataSource.destroy();
  }
});

test("tags appended through Repository.save() and findOneBy()", async () => {
  const dataSource = patchTypeORM(createDataSource());
  await dataSource.initialize();

  const executedQueries = interceptQueries(dataSource);

  try {
    const repo = dataSource.getRepository("User");
    await repo.save({ name: "alice" });

    const insertQuery = executedQueries.find(
      (q) => q.includes("INSERT") && q.includes("db_driver"),
    );
    assert.ok(
      insertQuery,
      `Expected a tagged INSERT via Repository.save(), got: ${executedQueries.join(", ")}`,
    );
    assert.match(insertQuery!, /db_driver='typeorm'/);

    executedQueries.length = 0;

    await repo.findOneBy({ name: "alice" });

    const selectQuery = executedQueries.find(
      (q) => q.includes("users") && q.includes("db_driver"),
    );
    assert.ok(
      selectQuery,
      `Expected a tagged SELECT via Repository.findOneBy(), got: ${executedQueries.join(", ")}`,
    );
    assert.match(selectQuery!, /db_driver='typeorm'/);
  } finally {
    await dataSource.destroy();
  }
});

test("tags appended through QueryBuilder", async () => {
  const dataSource = patchTypeORM(createDataSource());
  await dataSource.initialize();

  const repo = dataSource.getRepository("User");
  await repo.save({ name: "bob" });

  const executedQueries = interceptQueries(dataSource);

  try {
    await repo.createQueryBuilder("user").where("user.name = :name", { name: "bob" }).getMany();

    const taggedQuery = executedQueries.find(
      (q) => q.includes("users") && q.includes("db_driver"),
    );
    assert.ok(
      taggedQuery,
      `Expected a tagged query via QueryBuilder, got: ${executedQueries.join(", ")}`,
    );
    assert.match(taggedQuery!, /db_driver='typeorm'/);
  } finally {
    await dataSource.destroy();
  }
});

test("tags still appended when QueryBuilder.comment() is used", async () => {
  const dataSource = patchTypeORM(createDataSource());
  await dataSource.initialize();

  const repo = dataSource.getRepository("User");
  await repo.save({ name: "carol" });

  const executedQueries = interceptQueries(dataSource);

  try {
    await repo
      .createQueryBuilder("user")
      .comment("my-trace-id")
      .getMany();

    const taggedQuery = executedQueries.find(
      (q) => q.includes("users") && q.includes("db_driver"),
    );
    assert.ok(
      taggedQuery,
      `Expected sqlcommenter tags even with QueryBuilder.comment(), got: ${executedQueries.join(", ")}`,
    );
    assert.match(taggedQuery!, /\/\* my-trace-id \*\//);
    assert.match(taggedQuery!, /db_driver='typeorm'/);
  } finally {
    await dataSource.destroy();
  }
});

test("skips queries that already have trailing sqlcommenter tags", async () => {
  const dataSource = patchTypeORM(createDataSource());
  await dataSource.initialize();
  const executedQueries = interceptQueries(dataSource);

  try {
    const qr = dataSource.createQueryRunner();
    try {
      await qr.query("SELECT 1 as result /*db_driver='something'*/");
    } finally {
      await qr.release();
    }

    const query = executedQueries.find((q) => q.includes("db_driver"));
    assert.ok(query);
    const commentCount = (query!.match(/db_driver/g) || []).length;
    assert.strictEqual(
      commentCount,
      1,
      "Should not add another comment when trailing sqlcommenter tags exist",
    );
  } finally {
    await dataSource.destroy();
  }
});

test("query result is preserved", async () => {
  const dataSource = patchTypeORM(createDataSource());
  await dataSource.initialize();

  try {
    const repo = dataSource.getRepository("User");
    await repo.save({ name: "dave" });
    const user = await repo.findOneBy({ name: "dave" });
    assert.ok(user);
    assert.strictEqual(user.name, "dave");
  } finally {
    await dataSource.destroy();
  }
});
