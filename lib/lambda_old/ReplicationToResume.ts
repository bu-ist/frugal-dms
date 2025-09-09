import { DatabaseMigrationService, MigrationTypeValue, StartReplicationCommandInput, StartReplicationCommandOutput, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { DmsReplication } from "./Replication";
import { asServerTimestamp, getFutureDateString, getPastDateString, TimeUnit } from "./DateUtils";

export type ReplicationToRunParms = {
  replication: DmsReplication;
  scheduledRunAbortIfBeyondRedoLogRetention: boolean;
  scheduledRunDurationMinutes: number;
  databaseLogRetentionHours: number;
};

export interface IReplicationToResume {
  resumable(): Promise<boolean>;
  CdcStartPosition: string|undefined;
  CdcStartTime: Date|undefined;
  CdcStopPosition: string|undefined;
  PremigrationAssessmentSettings: string|undefined;
  ReplicationConfigArn: string;
  // StartReplicationType: string;
}

/**
 * Represents a new CDC replication configuration based on a prior replication and reconfigured to run over
 * a new period of time.
 */
export class ReplicationToResume implements IReplicationToResume {
  private _parms: ReplicationToRunParms;
  private _fullLoadReplication: DmsReplication | undefined;
  private _fullLoadReplicationLookup: boolean = true;
  private _cdcStartDate: Date | undefined;
  private _cdcStopDate: Date | undefined;

  constructor(parms: ReplicationToRunParms) {
    this._parms = parms;
  }

  public resumable = async (): Promise<boolean> => {
    const { setCdcStartAndStopDates, _parms: { replication: { arn } } } = this;

    await setCdcStartAndStopDates();

    if( ! this._cdcStartDate) {
      console.error(`Failed to set CDC start date for replication: ${arn}`);
      return false;
    }

    if( ! this._cdcStopDate) {
      console.error(`Failed to set CDC stop date for replication: ${arn}`);
      return false;
    }

    return true;
  }

  private setCdcStartAndStopDates = async ():Promise<void> => {
    const { 
        getFullLoadReplication, sufficientLogRetention, getStopTime, setCdcStartDate, _parms: {
        scheduledRunAbortIfBeyondRedoLogRetention, databaseLogRetentionHours,
        replication: { isFirstReplication, hasFailed, hasSucceeded, 
          parms: { ignoreLastError, neverAbort, repType, fullLoadConfigArn } 
        }
      } 
    } = this;

    if(isFirstReplication) {
      const fullLoadReplication = await getFullLoadReplication();
      if(fullLoadReplication) {
        if(fullLoadReplication.hasSucceeded) {
          if(sufficientLogRetention(fullLoadReplication)) {
            setCdcStartDate(fullLoadReplication);
          }
          else if( ! scheduledRunAbortIfBeyondRedoLogRetention) {
            

          }
        }
      }
      
    }
    else if(hasSucceeded) {

    }
    else if(hasFailed) {

    }
    
  }

  /**
   * The CDC replication should start at a point in the db logs one second after the full load stopped writing to them.
   * @param mostRecentReplication 
   */
  private setCdcStartDate = (mostRecentReplication: DmsReplication): void => {
    const { getStopTime } = this;
    const lastStopTime = getStopTime(mostRecentReplication);
    if(lastStopTime) {
      this._cdcStartDate = new Date(lastStopTime.getTime() + 1000);
    }
    this._cdcStartDate = new Date();
  }

  /**
   * The CDC replication being executed may be the first and would be following from a separate full load replication
   * Get that full load replication here.
   */
  private getFullLoadReplication = async (): Promise<DmsReplication | undefined> => {
    const { _fullLoadReplication, _fullLoadReplicationLookup, _parms: {
      replication: { parms: { ignoreLastError, neverAbort, fullLoadConfigArn } }
    } } = this;

    if( ! _fullLoadReplication && _fullLoadReplicationLookup) {
      if(fullLoadConfigArn) {
        this._fullLoadReplication = await DmsReplication.getInstance({
          configArn: fullLoadConfigArn,
          repType: MigrationTypeValue.FULL_LOAD,
          ignoreLastError,
          neverAbort
        });
        this._fullLoadReplicationLookup = false;
      }
    }
    return this._fullLoadReplication;
  }

  /**
   * Determine if database redo log retention is sufficiently long to still contain activity pertaining 
   * to the most recent replication execution
   * @param mostRecentReplication 
   * @returns 
   */
  private sufficientLogRetention(mostRecentReplication:DmsReplication): boolean {
    const { _parms: { databaseLogRetentionHours }, getStopTime } = this;
    const stopTime = getStopTime(mostRecentReplication);
    if( ! stopTime) {
      // No stop time means we can't determine if logs are purged, so assume they are not.
      return true; 
    }
    const retentionCutoff = new Date();
    retentionCutoff.setHours(retentionCutoff.getHours() - databaseLogRetentionHours);
    return stopTime >= retentionCutoff;
  }

  /**
   * Get the time that a replication last stopped.
   * @param replication 
   * @returns 
   */
  private getStopTime = (replication: DmsReplication): Date | undefined => {
    const { replication: { ReplicationLastStopTime, ReplicationStats: { StopDate } = {} } = {} } = replication;
    const stopDateStr = StopDate ?? ReplicationLastStopTime;
    if( ! stopDateStr) return undefined;
    return new Date(stopDateStr);
  }

  /**
   * Indicates when you want a change data capture (CDC) operation to start. 
   * Use either CdcStartPosition or CdcStartTime to specify when you want a CDC operation to start. 
   * Specifying both values results in an error.
   * The value can be in date, checkpoint, or LSN/SCN format.
   */
  public get CdcStartPosition(): string | undefined {
    const { _cdcStartDate } = this;
    if( _cdcStartDate) {
      return _cdcStartDate.toISOString();
    }
    return undefined;
  }
  /**
   * Indicates the start time for a change data capture (CDC) operation. Use either CdcStartTime or 
   * CdcStartPosition to specify when you want a CDC operation to start. Specifying both values results 
   * in an error.
   */
  public get CdcStartTime(): Date | undefined {
    return this._cdcStartDate;
  }
  public get CdcStopPosition(): string | undefined {
    const { _cdcStopDate } = this;
    if( _cdcStopDate) {
      return _cdcStopDate.toISOString();
    }
    return undefined;
  }
  /**
   * The Amazon Resource Name of the replication for which to start replication.
   */
  public get ReplicationConfigArn(): string {
    return this._parms.replication.arn;
  }
  /**
   * User-defined settings for the premigration assessment. 
   */
  public get PremigrationAssessmentSettings(): string | undefined {
    return undefined; // TODO: implement
  }

  public static async resume(replicationToResume:IReplicationToResume, dryrun:boolean=false): Promise<void> {
    if( ! await replicationToResume.resumable()) {
      throw new Error('Replication is not resumable');
    }

    const { 
      CdcStartPosition, CdcStartTime, CdcStopPosition, 
      PremigrationAssessmentSettings, ReplicationConfigArn 
    } = replicationToResume;

    const input = {
      ReplicationConfigArn,
      StartReplicationType: StartReplicationTaskTypeValue.RESUME_PROCESSING,
      CdcStartPosition,
      CdcStartTime,
      CdcStopPosition
    } as StartReplicationCommandInput;

    console.log(`Resuming replication with settings: ${JSON.stringify(input, null, 2)}`);
    if(dryrun) {
      console.log('Dry run, not starting replication');
      return;
    }

    // Start the replication
    const dms = new DatabaseMigrationService();
    const output = await dms.startReplication(input) as StartReplicationCommandOutput;
    console.log('DMS startReplication output:', JSON.stringify(output, null, 2))
  };
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToResume.ts')) {

  const lookbackMinutes = 30;
  const runtimeMinutes = 20;

  const CdcStartPosition = getPastDateString(lookbackMinutes, TimeUnit.MINUTE);
  const CdcStopPosition = asServerTimestamp(getFutureDateString(runtimeMinutes, TimeUnit.MINUTE));
  const dryrun = false;

  (async () => {
    ReplicationToResume.resume(new class implements IReplicationToResume {
      async resumable(): Promise<boolean> {
        return true;
      }
      CdcStartPosition = CdcStartPosition;
      CdcStartTime: undefined;
      CdcStopPosition = CdcStopPosition;
      PremigrationAssessmentSettings = undefined;
      ReplicationConfigArn = 'arn:aws:dms:us-east-1:770203350335:replication-config:XGHFY3MXBBAA7KRH4U4QYZDCGI';
    }, dryrun);
    console.log('Done');
  })();
}