

/**
 * Verbose replication settings. Includes all available settings for detailed logging and error handling.
 * For default values see: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.html
 */
export const VerboseReplicationSettings = {
  Logging: {
    EnableLogging: true,
    EnableLogContext: true,
    LogComponents: [
      { Id: "TRANSFORMATION", Severity: "LOGGER_SEVERITY_DEBUG" },
      { Id: "SOURCE_UNLOAD", Severity: "LOGGER_SEVERITY_DEBUG" },
      { Id: "TARGET_LOAD", Severity: "LOGGER_SEVERITY_DEBUG" },
      { Id: "IO", Severity: "LOGGER_SEVERITY_DEBUG" },
      { Id: "PERFORMANCE", Severity: "LOGGER_SEVERITY_DEBUG" },
      { Id: "VALIDATOR_EXT", Severity: "LOGGER_SEVERITY_DEBUG" }
    ]
  },
  ErrorBehavior: {
    RecoverableErrorCount: 1000,
    RecoverableErrorInterval: 5,
    RecoverableErrorThrottling: true,
    RecoverableErrorThrottlingMax: 1800
  },
  ValidationSettings: {
    EnableValidation: true, // Validation is off by default
    ValidationMode: "ROW_LEVEL",
    ThreadCount: 5,
    FailureMaxCount: 1000,
    RecordFailureDelayInMinutes: 5
  },
  ControlTablesSettings: {
    historyTimeslotInMinutes: 5,
    historyTableEnabled: true,
    SuspendedTablesTableEnabled: true,
    StatusTableEnabled: true,
    TaskRecoveryTableEnabled: true,
    ControlSchema: ""
  },
  FullLoadSettings: {
    // TargetTablePrepMode: "DROP_AND_CREATE", // Default is DO_NOTHING
    MaxFullLoadSubTasks: 8,
    TransactionConsistencyTimeout: 600,
    CommitRate: 10000
  },
  TargetMetadata: {
    SupportLobs: true, // Explicitly enabled for clarity
    FullLobMode: true,
    LobChunkSize: 64,
    LobMaxSize: 180000,  // ~163MB + buffer
    InlineLobMaxSize: 0,
    LimitedSizeLobMode: false,
    BatchApplyEnabled: true,
    TaskRecoveryTableEnabled: true
  },
  // Add explicit CheckpointSettings for Oracle precision
  CheckpointSettings: {
    CheckpointFrequency: 1,      // ← CRITICAL: Transaction-level for Oracle
    CheckpointInterval: 0,       // ← Disable time-based (use transaction-based)
    CheckpointMaxRetry: 3,
    CheckpointValidation: true   // ← Additional safety
  }
} as any;


/**
 * Serverless replication settings. Effectively the same as the verbose settings, but with the
 * Logging.LogComponents removed to avoid a not supported error - hence not so verbose.
 */
export const ServerlessReplicationSettings = {
  ...VerboseReplicationSettings,
  // Logging: {
  //   EnableLogging: true,
  //   EnableLogContext: true
  // }
} as any;

