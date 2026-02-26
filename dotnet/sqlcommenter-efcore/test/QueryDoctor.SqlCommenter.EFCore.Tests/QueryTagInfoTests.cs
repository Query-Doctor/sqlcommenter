namespace QueryDoctor.SqlCommenter.EFCore.Tests;

public class QueryTagInfoTests
{
    [Fact]
    public void ToSqlComment_WithAllFields_ProducesCorrectFormat()
    {
        var info = new QueryTagInfo
        {
            Action = "GetItems", Controller = "Items",
            FilePath = "/app/src/Controllers/ItemsController.cs",
            LineNumber = 42, ColumnNumber = 5, HttpMethod = "GET"
        };
        var comment = info.ToSqlComment();
        Assert.StartsWith("/*", comment);
        Assert.EndsWith("*/", comment);
        Assert.Contains("action='GetItems'", comment);
        Assert.Contains("controller='Items'", comment);
        Assert.Contains("db_driver='efcore'", comment);
        Assert.Contains("method='GET'", comment);
    }

    [Fact]
    public void ToSqlComment_MinimalFields_ProducesOnlyDbDriver()
    {
        var info = new QueryTagInfo();
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Equal("/*db_driver='efcore'*/", comment);
    }

    [Fact]
    public void ToSqlComment_DbDriverIsEfcore()
    {
        var info = new QueryTagInfo();
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("db_driver='efcore'", comment);
    }

    [Fact]
    public void ToSqlComment_KeysSortedLexicographically()
    {
        var info = new QueryTagInfo { Action = "Get", Controller = "Test", HttpMethod = "GET" };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        var actionIdx = comment.IndexOf("action=");
        var controllerIdx = comment.IndexOf("controller=");
        var dbDriverIdx = comment.IndexOf("db_driver=");
        var methodIdx = comment.IndexOf("method=");
        Assert.True(actionIdx < controllerIdx);
        Assert.True(controllerIdx < dbDriverIdx);
        Assert.True(dbDriverIdx < methodIdx);
    }

    [Fact]
    public void ToSqlComment_ValuesAreUrlEncoded()
    {
        var info = new QueryTagInfo { FilePath = "/app/src/path with spaces/file.cs", LineNumber = 1 };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("%20", comment);
        Assert.DoesNotContain("path with spaces", comment);
    }

    [Fact]
    public void ToSqlComment_FilePathNormalization_StripsSrcPrefix()
    {
        var info = new QueryTagInfo { FilePath = "/home/user/project/src/Controllers/TestController.cs", LineNumber = 10, ColumnNumber = 1 };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("Controllers%2FTestController.cs", comment);
        Assert.DoesNotContain("/home/user/project", comment);
    }

    [Fact]
    public void ToSqlComment_FilePathNormalization_WindowsPaths()
    {
        var info = new QueryTagInfo { FilePath = "C:\\Users\\dev\\project\\src\\Controllers\\TestController.cs", LineNumber = 10, ColumnNumber = 1 };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("Controllers%2FTestController.cs", comment);
    }

    [Fact]
    public void ToSqlComment_FilePathNormalization_NoSrcFolder_UsesFilename()
    {
        var info = new QueryTagInfo { FilePath = "/home/user/project/Controllers/TestController.cs", LineNumber = 10, ColumnNumber = 1 };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("TestController.cs", comment);
    }

    [Fact]
    public void ToSqlComment_FileLocation_IncludesLineAndColumn()
    {
        var info = new QueryTagInfo { FilePath = "/app/src/Test.cs", LineNumber = 42, ColumnNumber = 7 };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("Test.cs%3A42%3A7", comment);
    }

    [Fact]
    public void ToSqlComment_DefaultColumnIsOne()
    {
        var info = new QueryTagInfo { FilePath = "/app/src/Test.cs", LineNumber = 42, ColumnNumber = 0 };
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.Contains("Test.cs%3A42%3A1", comment);
    }

    [Fact]
    public void ToSqlComment_WithFrameworkVersion_IncludesFrameworkTag()
    {
        var info = new QueryTagInfo();
        var comment = info.ToSqlComment(includeFrameworkVersion: true);
        Assert.Contains("framework='efcore%3A", comment);
    }

    [Fact]
    public void ToSqlComment_WithoutFrameworkVersion_OmitsFrameworkTag()
    {
        var info = new QueryTagInfo();
        var comment = info.ToSqlComment(includeFrameworkVersion: false);
        Assert.DoesNotContain("framework=", comment);
    }
}
