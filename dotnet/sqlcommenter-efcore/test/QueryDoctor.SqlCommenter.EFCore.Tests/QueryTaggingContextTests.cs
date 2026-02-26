namespace QueryDoctor.SqlCommenter.EFCore.Tests;

public class QueryTaggingContextTests
{
    [Fact]
    public void Current_DefaultsToNull()
    {
        QueryTaggingContext.Current = null;
        Assert.Null(QueryTaggingContext.Current);
    }

    [Fact]
    public void SetContext_SetsCurrentValue()
    {
        using var scope = QueryTaggingContext.SetContext(action: "Test");
        Assert.NotNull(QueryTaggingContext.Current);
        Assert.Equal("Test", QueryTaggingContext.Current!.Action);
    }

    [Fact]
    public void SetContext_Dispose_RestoresPrevious()
    {
        QueryTaggingContext.Current = null;
        using (QueryTaggingContext.SetContext(action: "Test"))
        { Assert.NotNull(QueryTaggingContext.Current); }
        Assert.Null(QueryTaggingContext.Current);
    }

    [Fact]
    public void SetContext_NestedScopes_RestoresCorrectly()
    {
        QueryTaggingContext.Current = null;
        using (QueryTaggingContext.SetContext(action: "Outer"))
        {
            Assert.Equal("Outer", QueryTaggingContext.Current!.Action);
            using (QueryTaggingContext.SetContext(action: "Inner"))
            { Assert.Equal("Inner", QueryTaggingContext.Current!.Action); }
            Assert.Equal("Outer", QueryTaggingContext.Current!.Action);
        }
        Assert.Null(QueryTaggingContext.Current);
    }

    [Fact]
    public void SetContext_CapturesCallerFilePath()
    {
        using var scope = QueryTaggingContext.SetContext();
        Assert.NotNull(QueryTaggingContext.Current);
        Assert.NotNull(QueryTaggingContext.Current!.FilePath);
        Assert.Contains("QueryTaggingContextTests.cs", QueryTaggingContext.Current.FilePath);
    }

    [Fact]
    public void SetContext_CapturesCallerLineNumber()
    {
        using var scope = QueryTaggingContext.SetContext();
        Assert.NotNull(QueryTaggingContext.Current);
        Assert.True(QueryTaggingContext.Current!.LineNumber > 0);
    }

    [Fact]
    public void SetContext_CapturesCallerMemberName()
    {
        using var scope = QueryTaggingContext.SetContext();
        Assert.NotNull(QueryTaggingContext.Current);
        Assert.Equal("SetContext_CapturesCallerMemberName", QueryTaggingContext.Current!.MemberName);
    }

    [Fact]
    public void DoubleDispose_DoesNotThrow()
    {
        var scope = QueryTaggingContext.SetContext(action: "Test");
        scope.Dispose();
        scope.Dispose();
    }
}
