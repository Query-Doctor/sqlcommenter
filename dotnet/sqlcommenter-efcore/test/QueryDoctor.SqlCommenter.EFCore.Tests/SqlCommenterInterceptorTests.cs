using System.Data.Common;
using NSubstitute;

namespace QueryDoctor.SqlCommenter.EFCore.Tests;

public class SqlCommenterInterceptorTests
{
    private static DbCommand CreateMockCommand(string sql)
    {
        var command = Substitute.For<DbCommand>();
        command.CommandText = sql;
        return command;
    }

    [Fact]
    public void ReaderExecuting_AppendsComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT 1");
        using (QueryTaggingContext.SetContext(action: "Test", controller: "Home"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.Contains("/*", command.CommandText);
        Assert.Contains("*/", command.CommandText);
        Assert.StartsWith("SELECT 1", command.CommandText);
    }

    [Fact]
    public void ReaderExecutingAsync_AppendsComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT 1");
        using (QueryTaggingContext.SetContext(action: "Test", controller: "Home"))
        { interceptor.ReaderExecutingAsync(command, null!, default); }
        Assert.Contains("/*", command.CommandText);
    }

    [Fact]
    public void NonQueryExecuting_AppendsComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("INSERT INTO test VALUES (1)");
        using (QueryTaggingContext.SetContext(action: "Create", controller: "Home"))
        { interceptor.NonQueryExecuting(command, null!, default); }
        Assert.Contains("/*", command.CommandText);
        Assert.StartsWith("INSERT INTO test VALUES (1)", command.CommandText);
    }

    [Fact]
    public void ScalarExecuting_AppendsComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT COUNT(*) FROM test");
        using (QueryTaggingContext.SetContext(action: "Count", controller: "Home"))
        { interceptor.ScalarExecuting(command, null!, default); }
        Assert.Contains("/*", command.CommandText);
    }

    [Fact]
    public void Disabled_DoesNotAppendComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { Enabled = false });
        var command = CreateMockCommand("SELECT 1");
        using (QueryTaggingContext.SetContext(action: "Test", controller: "Home"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.Equal("SELECT 1", command.CommandText);
    }

    [Fact]
    public void ExistingCommentOpen_DoesNotAppendComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT 1 /* existing comment */");
        using (QueryTaggingContext.SetContext(action: "Test", controller: "Home"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.Equal("SELECT 1 /* existing comment */", command.CommandText);
    }

    [Fact]
    public void ExistingCommentClose_DoesNotAppendComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT 1 */");
        using (QueryTaggingContext.SetContext(action: "Test", controller: "Home"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.Equal("SELECT 1 */", command.CommandText);
    }

    [Fact]
    public void PreservesOriginalSql()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var originalSql = "SELECT * FROM users WHERE id = @p0";
        var command = CreateMockCommand(originalSql);
        using (QueryTaggingContext.SetContext(action: "Get", controller: "Users"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.StartsWith(originalSql, command.CommandText);
    }

    [Fact]
    public void ExplicitContext_TakesPriority()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = true });
        var command = CreateMockCommand("SELECT 1");
        using (QueryTaggingContext.SetContext(action: "ExplicitAction", controller: "ExplicitController"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.Contains("action='ExplicitAction'", command.CommandText);
        Assert.Contains("controller='ExplicitController'", command.CommandText);
    }

    [Fact]
    public void NoContext_NoStackInspection_NoComment()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT 1");
        interceptor.ReaderExecuting(command, null!, default);
        Assert.Equal("SELECT 1", command.CommandText);
    }

    [Fact]
    public void CommentContainsActionAndController()
    {
        var interceptor = new SqlCommenterInterceptor(new SqlCommenterOptions { EnableStackInspection = false });
        var command = CreateMockCommand("SELECT 1");
        using (QueryTaggingContext.SetContext(action: "MyAction", controller: "MyController"))
        { interceptor.ReaderExecuting(command, null!, default); }
        Assert.Contains("action='MyAction'", command.CommandText);
        Assert.Contains("controller='MyController'", command.CommandText);
    }
}
