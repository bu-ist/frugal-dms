import { DatabaseMigrationService, DescribeReplicationsCommandInput, DescribeReplicationsCommandOutput, MigrationTypeValue, Replication } from "@aws-sdk/client-database-migration-service";

export enum TASK_TYPE {
  START_REPLICATION='start-replication',
  RESUME_PROCESSING='resume-processing',
  RELOAD_TARGET='reload-target'
}

export enum TASK_STATUS {
  CREATED='created', // The task has been created.
  CREATING='creating', // The task is being created.
  STARTING='starting', // The task is starting (initializing resources).
  RUNNING='running', // The task is actively replicating data (CDC or full load).
  STOPPING='stopping', // The task is in the process of stopping.
  STOPPED='stopped', // The task has been stopped (manually or due to an error).
  DELETING='deleting', // The task is being deleted.
  FAILED='failed', // The task encountered an unrecoverable error.
  MODIFYING='modifying', // The task is being modified (e.g., settings updated).
  READY='ready', // The task is ready to start (but not yet running).
  MOVING='moving', // The task is being moved to a different replication instance.
  FAILED_MOVE='failed-move', // The task failed to move to another instance.
}

export enum STOP_REASON {
  NORMAL="NORMAL",
  RECOVERABLE_ERROR="RECOVERABLE_ERROR",
  FATAL_ERROR="FATAL_ERROR",
  FULL_LOAD_ONLY_FINISHED="FULL_LOAD_ONLY_FINISHED",
  STOPPED_AFTER_FULL_LOAD="STOPPED_AFTER_FULL_LOAD",
  STOPPED_AFTER_CACHED_EVENTS="STOPPED_AFTER_CACHED_EVENTS",
  EXPRESS_LICENSE_LIMITS_REACHED="EXPRESS_LICENSE_LIMITS_REACHED",
  STOPPED_AFTER_DDL_APPLY="STOPPED_AFTER_DDL_APPLY",
  STOPPED_DUE_TO_LOW_MEMORY="STOPPED_DUE_TO_LOW_MEMORY",
  STOPPED_DUE_TO_LOW_DISK="STOPPED_DUE_TO_LOW_DISK",
  STOPPED_AT_SERVER_TIME="STOPPED_AT_SERVER_TIME",
  STOPPED_AT_COMMIT_TIME="STOPPED_AT_COMMIT_TIME",
  RECONFIGURATION_RESTART="RECONFIGURATION_RESTART",
  RECYCLE_TASK="RECYCLE_TASK"
}

export type ReplicationParms = {
  configArn: string;
  neverAbort: boolean;
  ignoreLastError: boolean;
  repType: MigrationTypeValue;
  fullLoadConfigArn?: string;
};

/**
 * Class that performs an SDK lookup for a DMS replication and represents that replication and its current state.
 */
export class DmsReplication {
  private _parms: ReplicationParms;
  private _replication: Replication|undefined;
  private _validationMsg: string|undefined;

  private constructor(replication:Replication|undefined, parms: ReplicationParms) {
    this._replication = replication;
    this._parms = parms;
  }

  public get isBusy(): boolean {
    const { Status } = this._replication || {};
    return (
      Status === TASK_STATUS.STARTING || 
      Status === TASK_STATUS.RUNNING ||
      Status === TASK_STATUS.CREATING ||
      Status === TASK_STATUS.STOPPING ||
      Status === TASK_STATUS.DELETING ||
      Status === TASK_STATUS.MODIFYING ||
      Status === TASK_STATUS.MOVING
    );
  }

  public get hasFailed(): boolean {
    const { _replication: { Status, StopReason } = {}, isBusy } = this;
    if(Status === TASK_STATUS.FAILED) return true;
    if(isBusy) return false;
    if(StopReason?.includes(STOP_REASON.FATAL_ERROR)) return true;
    if(StopReason?.includes(STOP_REASON.RECOVERABLE_ERROR)) return true;
    if(StopReason?.includes(STOP_REASON.STOPPED_DUE_TO_LOW_MEMORY)) return true;
    if(StopReason?.includes(STOP_REASON.STOPPED_DUE_TO_LOW_DISK)) return true;
    if(StopReason?.includes(STOP_REASON.EXPRESS_LICENSE_LIMITS_REACHED)) return true;
    if(StopReason?.includes(STOP_REASON.RECONFIGURATION_RESTART)) return true;
    if(StopReason?.includes(STOP_REASON.RECYCLE_TASK)) return true;
    return false;
  };

  public get hasSucceeded(): boolean {
    const { _replication: { Status, StopReason } = {}, isBusy, replicationType, hasFailed } = this;
    const { FULL_LOAD, FULL_LOAD_AND_CDC } = MigrationTypeValue;
    if(hasFailed) return false;
    if(isBusy) return false;
    if(Status === TASK_STATUS.STOPPED && replicationType === FULL_LOAD) {
      if(StopReason === STOP_REASON.FULL_LOAD_ONLY_FINISHED) return true;
    }
    if(Status === TASK_STATUS.STOPPED && replicationType === FULL_LOAD_AND_CDC) {
      if(StopReason === STOP_REASON.FULL_LOAD_ONLY_FINISHED) return true;
      if(StopReason === STOP_REASON.STOPPED_AFTER_FULL_LOAD) return true;
      if(StopReason === STOP_REASON.STOPPED_AFTER_CACHED_EVENTS) return true;
    }
    return false;
  }

  public get invalidState(): boolean {
    const { isBusy, hasFailed, hasSucceeded } = this;
    if ( ! isBusy && ! hasFailed && ! hasSucceeded) return true;
    return false;
  }

  public get isFirstReplication(): boolean {
    const { ReplicationStats: { StartDate, StopDate } = {}, StopReason, Status } = this._replication || {};
    if(StartDate) return false;
    if(StopDate) return false;
    if(StopReason) return false;
    if(Status !== TASK_STATUS.CREATED) {
      console.warn(`Replication status is ${Status}, there is no evidence of ever having run`);
    }
    return true;
  };

  public get replicationType(): MigrationTypeValue | undefined {
    const { ReplicationType } = this._replication || {};
    return ReplicationType;
  }
  public get status(): TASK_STATUS | undefined {
    const { Status } = this._replication || {};
    return Status as TASK_STATUS | undefined;
  }
  public get arn(): string {
    const { ReplicationConfigArn } = this._replication || {};
    return ReplicationConfigArn as string;
  }
  public get replication(): Replication | undefined {
    return this._replication;
  }
  public get parms(): ReplicationParms {
    return this._parms;
  }

  /**
   * Make sure all the needed properties are present and they have values that don't suggest obvious problems.
   */
  public get isValid(): boolean {
    const { 
      _parms: { ignoreLastError, neverAbort, repType }, _replication: replication, 
      _replication: { ReplicationType } = {}, 
      arn, replicationType, hasFailed, invalidState, isBusy, hasSucceeded, status
    } = this;
   
    if( ! replication) {
      this._validationMsg = `No replication found for ${arn}`;
    }
    // False if the replication is not a CDC only type
    if(ReplicationType !== repType) {
      this._validationMsg = `Invalid replication type: ${replicationType || 'unknown'}`;
    }
    // False if the replication status is incompatible with starting
    else if( ! hasFailed || isBusy) {
      this._validationMsg = `Invalid replication status: ${status || 'unknown'}`;
    }
    // Bail out if the last replication failed and we are not ignoring errors.
    else if(hasFailed && ! ignoreLastError && ! neverAbort) {
      this._validationMsg = `${arn} failed during its most recent run, and not configured to ignore errors`;
    }
    else if(invalidState) {
      this._validationMsg = `Replication is in an invalid state: ${JSON.stringify({
        isBusy, hasFailed, hasSucceeded
      }, null, 2)}`;
    }
    return ! this._validationMsg;
  }

  public get validationMsgText(): string | undefined {
    return this._validationMsg;
  }

  /**
   * Use the SDK to look up the last replication that was based on the specified configuration.
   * @param parms 
   * @returns 
   */
  public static async getInstance(parms: ReplicationParms): Promise<DmsReplication> {
    const { configArn } = parms;
    const dms = new DatabaseMigrationService();

    // Look up the replication config
    let output = await dms.describeReplications({
      Filters: [{ Name: 'replication-config-arn', Values: [ configArn ] }],
    } as DescribeReplicationsCommandInput) as DescribeReplicationsCommandOutput;

    // Bail out if the lookup failed
    const replication = output.Replications?.[0];
    if ( ! replication ) {
      throw new Error(`No replication config found for ${configArn}`);
    }

    // Log the replication.
    console.log(`${configArn} found as:`, JSON.stringify(replication, null, 2));

    return new DmsReplication(replication, parms);
  }
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/Replication.ts')) {

  (async () => {
    const replication = await DmsReplication.getInstance({
      configArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:K7YGWZDYPBFYDK2I6JBHYYDKEM',
      // configArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:XGHFY3MXBBAA7KRH4U4QYZDCGI',
      ignoreLastError: true,
      neverAbort: true,
      repType: MigrationTypeValue.CDC,
    });

    console.log(JSON.stringify(replication.replication, null, 2));
  })();
}