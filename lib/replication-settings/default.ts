

/**
 * Standard replication settings. Includes all available settings for moderately detailed logging and error handling.
 * For default values see: https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.CustomizingTasks.TaskSettings.html
 * 
 * Note: To turn up the verbosity of logging, change any one or more of the LogComponents for severity
 *   - LOGGER_SEVERITY_ERROR
 *   - LOGGER_SEVERITY_WARNING
 *   - LOGGER_SEVERITY_INFO
 *   - LOGGER_SEVERITY_DEBUG
 *   - LOGGER_SEVERITY_DETAILED_DEBUG
 */
export const StandardReplicationSettings = {
  Logging: {
    EnableLogging: true,
    EnableLogContext: true,
    LogComponents: [
      { Id: "TRANSFORMATION", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "SOURCE_CAPTURE", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "SOURCE_UNLOAD", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "TARGET_LOAD", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "TARGET_APPLY", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "IO", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "PERFORMANCE", Severity: "LOGGER_SEVERITY_INFO" },
      { Id: "VALIDATOR_EXT", Severity: "LOGGER_SEVERITY_INFO" }
    ]
  },
  ErrorBehavior: {
    RecoverableErrorCount: 1000,
    RecoverableErrorInterval: 5,
    RecoverableErrorThrottling: true,
    RecoverableErrorThrottlingMax: 1800,
    FailOnNoTablesCaptured: true,
    // FullLoadIgnoreConflicts: false,
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
    MaxFullLoadSubTasks: 8, // Controls how many tables can be processed in parallel. Increase this for many small tables.
    ParallelLoadThreads: 2, // Controls how much each sub task can do in parallel. Increase this for large tables.
    TransactionConsistencyTimeout: 600,
    CommitRate: 10000, // Indicates the maximum number of records that can be transferred together
    CreatePkAfterFullLoad: false,
    StopTaskCachedChangesApplied: false,
    StopTaskCachedChangesNotApplied: false
  },

  TargetMetadata: {
    SupportLobs: true, // Explicitly enabled for clarity
    FullLobMode: false,
    LobChunkSize: 64,
    InlineLobMaxSize: 0,
    LimitedSizeLobMode: true,
    LobMaxSize: 7000,  // ~6.86MB + buffer
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
 * Serverless replication settings. Effectively the same as the standard settings, but with the
 * Logging.LogComponents removed to avoid a not supported error - hence not so verbose.
 */
export const ServerlessReplicationSettings = {
  ...StandardReplicationSettings,
  Logging: { ...StandardReplicationSettings.Logging, },
  ErrorBehavior: { ...StandardReplicationSettings.ErrorBehavior, },
  ValidationSettings: { ...StandardReplicationSettings.ValidationSettings, },
  ControlTablesSettings: { ...StandardReplicationSettings.ControlTablesSettings, },
  TargetMetadata: { ...StandardReplicationSettings.TargetMetadata, },
  CheckpointSettings: { ...StandardReplicationSettings.CheckpointSettings, },
  FullLoadSettings: { 
    ...StandardReplicationSettings.FullLoadSettings, 
    // ParallelLoadThreads not available for serverless replications as it is managed automatically based on the DCU settings.
    ParallelLoadThreads: undefined
  },
} as any;

/**
 * Serverless replication settings with the Logging.LogComponents modified so that each component with a 
 * severity of LOGGER_SEVERITY_INFO is replaced with LOGGER_SEVERITY_DEBUG for more verbose logging.
 */
export const ServerlessReplicationSettingsDebug = {
  ...ServerlessReplicationSettings,
  Logging: {
    ...ServerlessReplicationSettings.Logging,
    LogComponents: ServerlessReplicationSettings.Logging.LogComponents.map( (lc: any) => {
      if(lc.Severity === 'LOGGER_SEVERITY_INFO') {
        return { ...lc, Severity: 'LOGGER_SEVERITY_DEBUG' };
      }
      return lc;
    })
  }
} as any;

/**
 * Serverless replication settings with the Logging.LogComponents modified so that each component with a 
 * severity of LOGGER_SEVERITY_INFO is replaced with LOGGER_SEVERITY_WARNING for lower verbosity logging.
 */
export const ServerlessReplicationSettingsWarning = {
  ...ServerlessReplicationSettings,
  Logging: {
    ...ServerlessReplicationSettings.Logging,
    LogComponents: ServerlessReplicationSettings.Logging.LogComponents.map( (lc: any) => {
      if(lc.Severity === 'LOGGER_SEVERITY_INFO') {
        return { ...lc, Severity: 'LOGGER_SEVERITY_WARNING' };
      }
      return lc;
    })
  }
} as any;
