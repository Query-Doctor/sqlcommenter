# Contributing

This repository holds Query Doctor's SQLCommenter integrations. Each one appends a SQLCommenter comment to the queries an ORM or driver sends, so Query Doctor can map every query back to the code that issued it. The repository started as a fork of [google/sqlcommenter](https://github.com/google/sqlcommenter).

Pull requests are welcome, both for fixes to an existing integration and for new ones.

## Adding an integration

[Writing your own integration](https://docs.querydoctor.com/guides/writing-your-own-integration/) documents the comment format and the keys Query Doctor reads.

1. Put the integration in its language's folder, next to the existing ones: for example `nodejs/sqlcommenter-nodejs/packages/sqlcommenter-<orm>` or `dotnet/sqlcommenter-<orm>`.
2. Write tests that run a query through the ORM or driver and check the comment at the end of the SQL it sends.
3. Add a workflow in `.github/workflows` that runs those tests on pull requests that touch the integration's folder. `nodejs-drizzle-tests.yaml` is a short one to copy.
4. Add a README with installation and setup steps, and link it from the list in the root README.

## Licence

Contributions are accepted under the [Apache License 2.0](LICENSE), the licence the rest of the repository uses. No contributor licence agreement is needed.
