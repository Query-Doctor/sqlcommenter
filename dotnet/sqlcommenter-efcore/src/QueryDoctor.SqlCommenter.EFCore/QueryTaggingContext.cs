using System.Runtime.CompilerServices;

namespace QueryDoctor.SqlCommenter.EFCore;

/// <summary>
/// Provides ambient context for SQL query tagging following SQLCommenter format.
/// Uses <see cref="AsyncLocal{T}"/> to flow context across async/await boundaries.
/// </summary>
public static class QueryTaggingContext
{
    private static readonly AsyncLocal<QueryTagInfo?> _currentTag = new();

    /// <summary>
    /// Gets or sets the current query tag info for the async context.
    /// Returns <c>null</c> if no context has been set.
    /// </summary>
    public static QueryTagInfo? Current
    {
        get => _currentTag.Value;
        set => _currentTag.Value = value;
    }

    /// <summary>
    /// Sets the query context with caller information.
    /// Caller attributes are automatically captured by the compiler.
    /// </summary>
    /// <param name="action">The action name (e.g., controller action).</param>
    /// <param name="controller">The controller name.</param>
    /// <param name="filePath">Automatically captured source file path.</param>
    /// <param name="lineNumber">Automatically captured source line number.</param>
    /// <param name="memberName">Automatically captured calling member name.</param>
    /// <returns>An <see cref="IDisposable"/> that restores the previous context when disposed.</returns>
    public static IDisposable SetContext(
        string? action = null,
        string? controller = null,
        [CallerFilePath] string? filePath = null,
        [CallerLineNumber] int lineNumber = 0,
        [CallerMemberName] string? memberName = null)
    {
        var previous = _currentTag.Value;
        _currentTag.Value = new QueryTagInfo
        {
            FilePath = filePath,
            LineNumber = lineNumber,
            MemberName = memberName,
            Action = action,
            Controller = controller
        };
        return new ContextScope(previous);
    }

    private sealed class ContextScope : IDisposable
    {
        private readonly QueryTagInfo? _previous;
        private bool _disposed;

        public ContextScope(QueryTagInfo? previous) => _previous = previous;

        public void Dispose()
        {
            if (!_disposed)
            {
                _currentTag.Value = _previous;
                _disposed = true;
            }
        }
    }
}
