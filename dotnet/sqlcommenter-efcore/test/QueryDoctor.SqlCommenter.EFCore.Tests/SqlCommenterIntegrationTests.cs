using System.Data.Common;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace QueryDoctor.SqlCommenter.EFCore.Tests;

public class SqlCommenterIntegrationTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public SqlCommenterIntegrationTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
    }

    public void Dispose() => _connection.Dispose();

    private (TestDbContext context, SqlCapturingInterceptor captor) CreateContext(
        Action<SqlCommenterOptions>? configure = null)
    {
        var captor = new SqlCapturingInterceptor();
        var optionsBuilder = new DbContextOptionsBuilder<TestDbContext>().UseSqlite(_connection);
        if (configure != null) optionsBuilder.AddSqlCommenter(configure);
        else optionsBuilder.AddSqlCommenter(o => o.EnableStackInspection = false);
        optionsBuilder.AddInterceptors(captor);
        var context = new TestDbContext(optionsBuilder.Options);
        context.Database.EnsureCreated();
        captor.CapturedCommands.Clear();
        return (context, captor);
    }

    [Fact]
    public async Task RealQuery_AppendsDbDriverTag()
    {
        var (context, captor) = CreateContext();
        using (QueryTaggingContext.SetContext(action: "Query"))
        { await context.Items.ToListAsync(); }
        Assert.NotEmpty(captor.CapturedCommands);
        var sql = captor.CapturedCommands.First(c => c.Contains("Items"));
        Assert.Contains("db_driver='efcore'", sql);
    }

    [Fact]
    public async Task RealQuery_WithExplicitContext_IncludesControllerAndAction()
    {
        var (context, captor) = CreateContext(o => o.EnableStackInspection = false);
        using (QueryTaggingContext.SetContext(action: "List", controller: "Items"))
        { await context.Items.ToListAsync(); }
        var sql = captor.CapturedCommands.First(c => c.Contains("Items"));
        Assert.Contains("action='List'", sql);
        Assert.Contains("controller='Items'", sql);
    }

    [Fact]
    public async Task Disabled_DoesNotAppendToRealQuery()
    {
        var (context, captor) = CreateContext(o => o.Enabled = false);
        using (QueryTaggingContext.SetContext(action: "Test"))
        { await context.Items.ToListAsync(); }
        var sql = captor.CapturedCommands.First(c => c.Contains("Items"));
        Assert.DoesNotContain("/*", sql);
    }

    [Fact]
    public async Task RealInsert_AppendsComment()
    {
        var (context, captor) = CreateContext(o => o.EnableStackInspection = false);
        using (QueryTaggingContext.SetContext(action: "Create", controller: "Items"))
        {
            context.Items.Add(new TestItem { Name = "Test" });
            await context.SaveChangesAsync();
        }
        var sql = captor.CapturedCommands.First(c => c.Contains("INSERT"));
        Assert.Contains("db_driver='efcore'", sql);
        Assert.Contains("action='Create'", sql);
    }
}

public class TestDbContext : DbContext
{
    public TestDbContext(DbContextOptions<TestDbContext> options) : base(options) { }
    public DbSet<TestItem> Items => Set<TestItem>();
}

public class TestItem
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
}

public class SqlCapturingInterceptor : DbCommandInterceptor
{
    public List<string> CapturedCommands { get; } = new();

    public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    { CapturedCommands.Add(command.CommandText); return base.ReaderExecuting(command, eventData, result); }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    { CapturedCommands.Add(command.CommandText); return base.ReaderExecutingAsync(command, eventData, result, cancellationToken); }

    public override InterceptionResult<int> NonQueryExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    { CapturedCommands.Add(command.CommandText); return base.NonQueryExecuting(command, eventData, result); }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    { CapturedCommands.Add(command.CommandText); return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken); }
}
