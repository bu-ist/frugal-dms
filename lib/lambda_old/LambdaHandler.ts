import { DatabaseMigrationService, MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { DmsReplication } from "./Replication";
import { ReplicationToResume } from "./ReplicationToResume";

export const handler = async (event?:any):Promise<any> => {

  let returnValue: any|undefined;
  let cdcReplication: DmsReplication|undefined;
  let fullLoadReplication: DmsReplication|undefined;
  let fullLoadAndCdcReplication: DmsReplication|undefined;

  /**
   * Validate the environment variables.
   */
  const validateEnvironment = () => {
    const { ACTIVE, CDC_ONLY_CONFIG_ARN } = process.env;
    if(ACTIVE?.toLowerCase() !== 'true') {
      returnValue = { status: 'SUCCESS', taskStatus: 'DMS task is not active' };
    }
    if( ! CDC_ONLY_CONFIG_ARN) {
      returnValue = { status: 'FAILED', taskStatus: 'Missing CDC_ONLY_CONFIG_ARN environment variable' };
    }
    if(returnValue) {
      throw new Error();
    }
  }

  /**
   * Initiate the replication task.
   */
  try {
    const dms = new DatabaseMigrationService();
    const { 
      FULL_LOAD_CONFIG_ARN, 
      FULL_LOAD_AND_CDC_CONFIG_ARN, 
      CDC_ONLY_CONFIG_ARN, 
      IGNORE_LAST_ERROR, 
      SOURCE_DB_REDO_LOG_RETENTION_HOURS,
      ABORT_IF_BEYOND_REDO_LOG_RETENTION,
      REPLICATION_DURATION_MINUTES,
      NEVER_ABORT
    } = process.env;

    // Verify that expected environment variable are set and have compatible values.
    validateEnvironment();

    // Lookup the CDC replication configuration.
    cdcReplication = await DmsReplication.getInstance({ 
      configArn: CDC_ONLY_CONFIG_ARN!, 
      fullLoadConfigArn: FULL_LOAD_CONFIG_ARN,
      repType: MigrationTypeValue.CDC,
      ignoreLastError: IGNORE_LAST_ERROR === 'true',
      neverAbort: NEVER_ABORT === 'true'
    });

    // Bail out if the replication shows any kind of issue.
    if( ! cdcReplication.isValid) {
      throw new Error(cdcReplication.validationMsgText || 'CDC replication is not valid');
    }

    // Bail out if the replication is already in progress, being created, etc.
    if(cdcReplication.isBusy) {
      const { status } = cdcReplication;
      returnValue = { status: 'FAILED', taskStatus: `DMS task is busy, status = ${status}` };
      throw new Error();
    }

    // Get an executable replication
    const cdcReplicationExecution = new ReplicationToResume({
      replication: cdcReplication,
      scheduledRunAbortIfBeyondRedoLogRetention: ABORT_IF_BEYOND_REDO_LOG_RETENTION ? 
        Boolean(ABORT_IF_BEYOND_REDO_LOG_RETENTION) : 
        true,
      scheduledRunDurationMinutes: Number(REPLICATION_DURATION_MINUTES),
      databaseLogRetentionHours: Number(SOURCE_DB_REDO_LOG_RETENTION_HOURS),
    });

    // // Determine the checkpoint for the CDC replication config
    // const cdcCheckpoint = cdcConfig.ReplicationConfigSettings?.CdcSettings?.CdcStartPosition;

    // /**
    //  * With DMS serverless, we use a replication configuration (not a replication task), therefore all
    //  * replication tasks are associated with a replication configuration and created implicitly.
    //  * Therefore these automatically created tasks must be looked up because they cannot be known ahead of time.
    //  */
    // const tasks:DescribeReplicationTasksCommandOutput = await dms.describeReplicationTasks({
    //   Filters: [{ Name: 'replication-config-arn', Values: [ REPLICATION_CONFIG_ARN ] }],
    // } as DescribeReplicationTasksCommandInput);

    // // Validate that we found at least one task
    // const ReplicationTaskArn = tasks.ReplicationTasks?.[0]?.ReplicationTaskArn;
    // if ( ! ReplicationTaskArn) throw new Error('No task found for config');

    // // Start the replication task
    // const result:StartReplicationTaskCommandOutput = await dms.startReplicationTask({
    //   ReplicationTaskArn,
    //   StartReplicationTaskType,
    // } as StartReplicationTaskCommandInput);

    // const { ReplicationTask: { Status:taskStatus='unknown' } = {} } = result;

    // if(taskStatus === TASK_STATUS.FAILED) {
    //   return { status: 'FAILED', taskStatus: 'DMS task failed to start' };
    // }

    // console.log('DMS startReplicationTask result:', JSON.stringify(result));

    // return { status: 'SUCCESS', taskStatus };
  } 
  catch(e) {
    if(returnValue) {
      return returnValue;
    }
    console.error('Failed to start DMS task:', e);
    throw e; // Triggers EventBridge retry
  }   
};

/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/LambdaHandler.ts')) {

  // process.env.CDC_ONLY_CONFIG_ARN = 'arn:aws:dms:us-east-1:770203350335:replication-config:K7YGWZDYPBFYDK2I6JBHYYDKEM';

  process.env.CDC_ONLY_CONFIG_ARN = 'arn:aws:dms:us-east-1:770203350335:replication-config:XGHFY3MXBBAA7KRH4U4QYZDCGI';

  // process.env.CDC_ONLY_CONFIG_ARN = 'arn:aws:dms:us-east-1:770203350335:replication-config:YHZFNYU7FZBIJE567HBEHIIUBY';

  (async () => {
    await handler();
    console.log('Done');
  })();
}