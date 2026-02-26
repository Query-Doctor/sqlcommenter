using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace QueryDoctor.SqlCommenter.EFCore;

/// <summary>
/// EF Core command interceptor that appends SQLCommenter-formatted comments to queries.
/// Comments include source file location and method name for debugging and profiling.
/// </summary>
public class SqlCommenterInterceptor : DbCommandInterceptor
{
    private readonly SqlCommenterOptions _options;

    private static readonly HashSet<string> _frameworkAssemblyPrefixes =
    [
        "Microsoft.EntityFrameworkCore",
        "Npgsql",
        "System.",
        "Microsoft.Extensions",
        "Microsoft.AspNetCore"
    ];

    /// <summary>
    /// Initializes a new instance of <see cref="SqlCommenterInterceptor"/>.
    /// </summary>
    /// <param name="options">Configuration options. If <c>null</c>, default options are used.</param>
    public SqlCommenterInterceptor(SqlCommenterOptions? options = null)
    {
        _options = options ?? new SqlCommenterOptions();
    }

    /// <inheritdoc />
    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        AppendSqlComment(command);
        return base.ReaderExecuting(command, eventData, result);
    }

    /// <inheritdoc />
    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        AppendSqlComment(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    /// <inheritdoc />
    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        AppendSqlComment(command);
        return base.NonQueryExecuting(command, eventData, result);
    }

    /// <inheritdoc />
    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        AppendSqlComment(command);
        return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    /// <inheritdoc />
    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        AppendSqlComment(command);
        return base.ScalarExecuting(command, eventData, result);
    }

    /// <inheritdoc />
    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result,
        CancellationToken cancellationToken = default)
    {
        AppendSqlComment(command);
        return base.ScalarExecutingAsync(command, eventData, result, cancellationToken);
    }

    private void AppendSqlComment(DbCommand command)
    {
        if (!_options.Enabled)
            return;

        if (command.CommandText.Contains("/*") || command.CommandText.Contains("*/"))
            return;

        try
        {
            var tagInfo = GetTagInfo();
            if (tagInfo != null)
            {
                var comment = tagInfo.ToSqlComment(_options.IncludeFrameworkVersion);
                if (!string.IsNullOrEmpty(comment))
                {
                    command.CommandText = $"{command.CommandText} {comment}";
                }
            }
        }
        catch
        {
            // Never fail a query due to tagging errors
        }
    }

    private QueryTagInfo? GetTagInfo()
    {
        var explicitContext = QueryTaggingContext.Current;
        if (explicitContext != null)
            return explicitContext;

        if (_options.EnableStackInspection)
            return InspectStackForCallerInfo();

        return null;
    }

    private QueryTagInfo? InspectStackForCallerInfo()
    {
        try
        {
            var stackTrace = new StackTrace(fNeedFileInfo: true);
            var frames = stackTrace.GetFrames();

            if (frames == null)
                return null;

            for (int i = 0; i < Math.Min(frames.Length, _options.MaxStackDepth); i++)
            {
                var frame = frames[i];
                var method = frame.GetMethod();
                if (method == null) continue;

                var declaringType = method.DeclaringType;
                if (declaringType == null) continue;

                var assemblyName = declaringType.Assembly.GetName().Name;
                if (assemblyName == null) continue;

                if (IsFrameworkAssembly(assemblyName)) continue;
                if (declaringType.Namespace?.StartsWith("QueryDoctor.SqlCommenter.EFCore") == true) continue;

                var fileName = frame.GetFileName();
                var lineNumber = frame.GetFileLineNumber();
                var columnNumber = frame.GetFileColumnNumber();

                return new QueryTagInfo
                {
                    FilePath = fileName,
                    LineNumber = lineNumber,
                    ColumnNumber = columnNumber > 0 ? columnNumber : 1,
                    MemberName = method.Name,
                    Controller = GetControllerName(declaringType),
                    Action = GetActionName(declaringType, method),
                    HttpMethod = GetHttpMethod(method)
                };
            }
        }
        catch
        {
            // Stack inspection can fail in various scenarios
        }

        return null;
    }

    private static bool IsFrameworkAssembly(string assemblyName)
    {
        foreach (var prefix in _frameworkAssemblyPrefixes)
        {
            if (assemblyName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private static string? GetControllerName(Type type)
    {
        var name = type.Name;
        if (name.EndsWith("Controller", StringComparison.OrdinalIgnoreCase))
            return name[..^"Controller".Length];
        return null;
    }

    private static string? GetActionName(Type declaringType, System.Reflection.MethodBase method)
    {
        if (!declaringType.Name.EndsWith("Controller", StringComparison.OrdinalIgnoreCase))
            return null;
        return method.Name;
    }

    private static string? GetHttpMethod(System.Reflection.MethodBase method)
    {
        var attrs = method.GetCustomAttributes(false);
        foreach (var attr in attrs)
        {
            var attrName = attr.GetType().Name;
            var httpMethod = attrName switch
            {
                "HttpGetAttribute" => "GET",
                "HttpPostAttribute" => "POST",
                "HttpPutAttribute" => "PUT",
                "HttpDeleteAttribute" => "DELETE",
                "HttpPatchAttribute" => "PATCH",
                "HttpHeadAttribute" => "HEAD",
                "HttpOptionsAttribute" => "OPTIONS",
                _ => null
            };
            if (httpMethod != null) return httpMethod;
        }
        return null;
    }
}
