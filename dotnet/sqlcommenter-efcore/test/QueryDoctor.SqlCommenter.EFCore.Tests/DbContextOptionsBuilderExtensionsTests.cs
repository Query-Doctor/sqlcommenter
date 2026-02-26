using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace QueryDoctor.SqlCommenter.EFCore.Tests;

public class DbContextOptionsBuilderExtensionsTests
{
    [Fact]
    public void AddSqlCommenter_RegistersInterceptor()
    {
        var optionsBuilder = new DbContextOptionsBuilder<TestDbContext>().UseInMemoryDatabase("test_register");
        optionsBuilder.AddSqlCommenter();
        var options = optionsBuilder.Options;
        var extension = options.FindExtension<CoreOptionsExtension>();
        Assert.NotNull(extension);
        Assert.NotNull(extension.Interceptors);
        Assert.Contains(extension.Interceptors, i => i is SqlCommenterInterceptor);
    }

    [Fact]
    public void AddSqlCommenter_CustomOptions_InvokesDelegate()
    {
        var optionsBuilder = new DbContextOptionsBuilder<TestDbContext>().UseInMemoryDatabase("test_custom");
        var delegateInvoked = false;
        optionsBuilder.AddSqlCommenter(o => { delegateInvoked = true; o.Enabled = false; });
        Assert.True(delegateInvoked);
    }
}
