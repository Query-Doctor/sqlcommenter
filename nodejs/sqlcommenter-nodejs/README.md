# sqlcommenter

For Query Doctor packages, see:
- [sqlcommenter-drizzle](./packages/sqlcommenter-drizzle/README.md)
- [sqlcommenter-typeorm](./packages/sqlcommenter-typeorm/README.md)
- [sqlcommenter-mikroorm](./packages/sqlcommenter-mikroorm/README.md)

sqlcommenter is a suite of plugins/middleware/wrappers to augment SQL statements from ORMs/Querybuilders
with comments that can be used later to correlate user code with SQL statements.

It supports Node v6 and above to use ES6 features.

### Supported frameworks:

- Sequelize
- Knex.js
- Drizzle
- TypeORM
- MikroORM

### Installation

| Middleware   | Command                                             | URL                                                                |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| Knex.js      | `npm install @google-cloud/sqlcommenter-knex`       | https://www.npmjs.com/package/@google-cloud/sqlcommenter-knex      |
| Sequelize.js | `npm install @google-cloud/sqlcommenter-sequelize`  | https://www.npmjs.com/package/@google-cloud/sqlcommenter-sequelize |
| Drizzle      | `npm install @query-doctor/sqlcommenter-drizzle`    | https://www.npmjs.com/package/@query-doctor/sqlcommenter-drizzle   |
| TypeORM      | `npm install @query-doctor/sqlcommenter-typeorm`    | https://www.npmjs.com/package/@query-doctor/sqlcommenter-typeorm   |
| MikroORM     | `npm install @query-doctor/sqlcommenter-mikroorm`   | https://www.npmjs.com/package/@query-doctor/sqlcommenter-mikroorm  |
