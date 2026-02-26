namespace QueryDoctor.SqlCommenter.EFCore;

/// <summary>
/// Configuration options for the SQLCommenter interceptor.
/// </summary>
public class SqlCommenterOptions
{
    /// <summary>
    /// Whether SQLCommenter tagging is enabled. Default: true.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Whether to inspect the call stack for caller information
    /// when no explicit context is set. Default: true.
    /// </summary>
    public bool EnableStackInspection { get; set; } = true;

    /// <summary>
    /// Maximum stack depth to inspect. Higher values provide
    /// better accuracy but increase overhead. Default: 30.
    /// </summary>
    public int MaxStackDepth { get; set; } = 30;

    /// <summary>
    /// Whether to include the EF Core framework version in comments.
    /// Default: true.
    /// </summary>
    public bool IncludeFrameworkVersion { get; set; } = true;
}
