using Microsoft.EntityFrameworkCore;

namespace QueryDoctor.SqlCommenter.EFCore;

/// <summary>
/// Holds information about the query origin for SQLCommenter tagging.
/// </summary>
public sealed class QueryTagInfo
{
    /// <summary>Source file path where the query originated.</summary>
    public string? FilePath { get; init; }

    /// <summary>Line number in the source file.</summary>
    public int LineNumber { get; init; }

    /// <summary>Column number in the source file. Defaults to 1 if not available.</summary>
    public int ColumnNumber { get; init; }

    /// <summary>Name of the method that initiated the query.</summary>
    public string? MemberName { get; init; }

    /// <summary>Controller action name (for ASP.NET Core controllers).</summary>
    public string? Action { get; init; }

    /// <summary>Controller name without the "Controller" suffix.</summary>
    public string? Controller { get; init; }

    /// <summary>HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS).</summary>
    public string? HttpMethod { get; init; }

    /// <summary>
    /// Formats the tag info as a SQLCommenter-compatible comment.
    /// Keys are sorted lexicographically per the spec.
    /// </summary>
    /// <param name="includeFrameworkVersion">Whether to include the EF Core framework version tag.</param>
    /// <returns>A SQL comment string, or empty string if no tags are available.</returns>
    public string ToSqlComment(bool includeFrameworkVersion = true)
    {
        var pairs = new SortedDictionary<string, string>(StringComparer.Ordinal);

        if (!string.IsNullOrEmpty(Action))
        {
            pairs["action"] = Action;
        }

        if (!string.IsNullOrEmpty(Controller))
        {
            pairs["controller"] = Controller;
        }

        pairs["db_driver"] = "efcore";

        if (!string.IsNullOrEmpty(FilePath))
        {
            var normalizedPath = NormalizePath(FilePath);
            var column = ColumnNumber > 0 ? ColumnNumber : 1;
            var location = LineNumber > 0
                ? $"{normalizedPath}:{LineNumber}:{column}"
                : normalizedPath;
            pairs["file"] = location;
        }

        if (includeFrameworkVersion)
        {
            var efCoreVersion = typeof(DbContext).Assembly.GetName().Version;
            var major = efCoreVersion?.Major ?? 8;
            var minor = efCoreVersion?.Minor ?? 0;
            pairs["framework"] = $"efcore:{major}.{minor}";
        }

        if (!string.IsNullOrEmpty(HttpMethod))
        {
            pairs["method"] = HttpMethod;
        }

        if (pairs.Count == 0)
            return string.Empty;

        var formattedPairs = pairs.Select(kvp => $"{EncodeKey(kvp.Key)}={EncodeValue(kvp.Value)}");
        return $"/*{string.Join(",", formattedPairs)}*/";
    }

    private static string NormalizePath(string path)
    {
        var srcIndex = path.IndexOf("src/", StringComparison.OrdinalIgnoreCase);
        if (srcIndex == -1)
        {
            srcIndex = path.IndexOf("src\\", StringComparison.OrdinalIgnoreCase);
        }

        if (srcIndex >= 0)
        {
            return path[(srcIndex + 4)..].Replace('\\', '/');
        }

        return Path.GetFileName(path);
    }

    private static string EncodeKey(string key)
    {
        var encoded = Uri.EscapeDataString(key);
        return EscapeMetaCharacters(encoded);
    }

    private static string EncodeValue(string value)
    {
        var urlEncoded = Uri.EscapeDataString(value);
        var escaped = urlEncoded.Replace("'", "\\'");
        return $"'{escaped}'";
    }

    private static string EscapeMetaCharacters(string value)
    {
        return value.Replace("\\", "\\\\").Replace("'", "\\'");
    }
}
