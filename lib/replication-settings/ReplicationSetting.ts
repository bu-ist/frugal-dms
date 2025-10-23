import { 
  ServerlessReplicationSettings as defaultSettings, 
  ServerlessReplicationSettingsDebug as debugSettings, 
  ServerlessReplicationSettingsWarning as warningSettings
} from "./default";

export enum LogSeverity {
  WARNING = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * By default, replication settings are derived from ./default.ts, which where suitable for an
 * oracle source database. If you want to customize the settings, create a file named
 * custom.js in this directory that exports a ServerlessReplicationSettings object. This file
 * will be imported dynamically when this function is called.
 * 
 * export const ServerlessReplicationSettings = {
 *   ... your settings here ...
 * }
 * @returns 
 */
export const getReplicationSettings = async (parms: { postgresSchema?: string, logSeverity?: LogSeverity }): Promise<any> => {
  const { postgresSchema, logSeverity = LogSeverity.INFO } = parms;
  
  const setControlSchema = (settings:any): Object => {
    if(postgresSchema) {
      settings.ControlTablesSettings = {
        ...settings.ControlTablesSettings,
        ControlSchema: postgresSchema.toLowerCase()
      };
    }
    return settings;
  }

  let coreSettings:any;
  try {
    // @ts-ignore
    coreSettings = await import('./custom.js');
    return setControlSchema(coreSettings.ServerlessReplicationSettings);
  } 
  catch (error) {
    switch (logSeverity) {
      case LogSeverity.DEBUG: // Most verbose
        return setControlSchema(debugSettings);
      case LogSeverity.WARNING: // Least verbose
        return setControlSchema(warningSettings);
      case LogSeverity.INFO: default: // Middle-of-the-road verbosity
        return setControlSchema(defaultSettings);
    }
  }
};