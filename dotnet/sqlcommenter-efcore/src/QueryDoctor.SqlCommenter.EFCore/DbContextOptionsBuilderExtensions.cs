using Microsoft.EntityFrameworkCore;

namespace QueryDoctor.SqlCommenter.EFCore;

/// <summary>
/// Extension methods for <see cref="DbContextOptionsBuilder"/> to register the SQLCommenter interceptor.
/// </summary>
public static class DbContextOptionsBuilderExtensions
{
    /// <summary>
    /// Adds the SQLCommenter interceptor to the DbContext options.
    /// </summary>
    /// <param name="optionsBuilder">The DbContext options builder.</param>
    /// <param name="configureOptions">Optional delegate to configure <see cref="SqlCommenterOptions"/>.</param>
    /// <returns>The same <see cref="DbContextOptionsBuilder"/> for chaining.</returns>
    public static DbContextOptionsBuilder AddSqlCommenter(
        this DbContextOptionsBuilder optionsBuilder,
        Action<SqlCommenterOptions>? configureOptions = null)
    {
        var options = new SqlCommenterOptions();
        configureOptions?.Invoke(options);
        optionsBuilder.AddInterceptors(new SqlCommenterInterceptor(options));
        return optionsBuilder;
    }
}
