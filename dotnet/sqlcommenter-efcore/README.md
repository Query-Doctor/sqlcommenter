# QueryDoctor.SqlCommenter.EFCore

EF Core interceptor that appends [SQLCommenter](https://google.github.io/sqlcommenter/)-formatted comments to SQL queries for query attribution and observability.

## Installation

```bash
dotnet add package QueryDoctor.SqlCommenter.EFCore
```

## Quick Start

```csharp
// In your DbContext configuration or Program.cs
options.UseSqlServer(connectionString).AddSqlCommenter();
```

This will automatically append comments to all SQL queries:

```sql
SELECT * FROM "Users" WHERE "Id" = @p0 /*action='GetUser',controller='Users',db_driver='efcore',file='Controllers%2FUsersController.cs%3A42%3A1',framework='efcore%3A8.0',method='GET'*/
```

## Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `action` | Controller action or method name | `GetUser` |
| `controller` | Controller name (without suffix) | `Users` |
| `db_driver` | Database driver identifier | `efcore` |
| `file` | Source file location (path:line:column) | `Controllers/UsersController.cs:42:1` |
| `framework` | EF Core version | `efcore:8.0` |
| `method` | HTTP method | `GET` |

## Configuration

```csharp
options.UseSqlServer(connectionString).AddSqlCommenter(o =>
{
    o.Enabled = true;                  // Enable/disable (default: true)
    o.EnableStackInspection = true;    // Auto-detect caller info (default: true)
    o.MaxStackDepth = 30;              // Max stack frames to inspect (default: 30)
    o.IncludeFrameworkVersion = true;  // Include EF Core version (default: true)
});
```

## Explicit Context

For precise control, use `QueryTaggingContext.SetContext()` instead of stack inspection:

```csharp
using (QueryTaggingContext.SetContext(action: "GetUser", controller: "Users"))
{
    var user = await context.Users.FindAsync(id);
}
```

Explicit context always takes priority over stack inspection. Caller file path, line number, and member name are automatically captured via `[CallerFilePath]`, `[CallerLineNumber]`, and `[CallerMemberName]`.

## Spec Compliance

- Keys are sorted lexicographically
- Values are URL-encoded and wrapped in single quotes
- SQL with existing comments (`/*` or `*/`) is not modified
- Errors during tagging never fail the query

## License

Apache-2.0
