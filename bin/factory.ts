import { MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { ListSchedulesCommand, ListSchedulesCommandInput, ListSchedulesCommandOutput, SchedulerClient, ScheduleState } from "@aws-sdk/client-scheduler"
import { IContext } from "../context/IContext";
import { startReplication } from "../lib/lambda/StartReplicationHandler";
import { runTestHarness } from "../lib/lambda/AbstractReplicationToCreate";
import { ReplicationToCreateSingleTable } from "../lib/lambda/ReplicationToCreateSingleTable";
import { ReplicationToCreate } from "../lib/lambda/ReplicationToCreate";
import { TaskType } from "../lib/lambda/Replication";
import { PostExecution } from "../lib/lambda/timer/DelayedExecution";

enum FactoryTask {
  START_FULL_LOAD = "full-load",
  START_CDC_LOAD = "cdc-load",
  CREATE_SERVERLESS = "create-serverless",
  CREATE_PROVISIONED = "create-provisioned",
  CANCEL_MIGRATION = "cancel-migration",
}

const equalsIgnoreCase = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const isDryRun = (): boolean => {
  const args = process.argv.slice(3);
  for(const arg of args) {
    if(arg.toLowerCase() === 'dryrun') {
      return true;
    }
  }
  return false;
}

/**
 * @returns A custom duration in minutes a replication is expected to take and will be used 
 * override the default configured CdcStopTime. Assumes this is the only numeric argument passed to the script.
 */
const getCustomDuration = (): number | undefined => {
  const args = process.argv.slice(3);
  for(const arg of args) {
    if( /^\d+$/.test(arg)) {
      return parseInt(arg);
    }
  }
  return undefined;
}

/**
 * 
 * @returns True if the 'smoketest' argument is passed to the script. This will indicate that the 
 * replication configuration should include a filter for source tables that reflect the single (or few) 
 * test tables configured in context.json for quick replication of a small amount of data.
 */
const isSmokeTest = (): boolean => {
  const args = process.argv.slice(3);
  for(const arg of args) {
    if(arg.toLowerCase() === 'smoketest') {
      return true;
    }
  }
  return false;
}

/**
 * @returns The migration type to use for replications created by this script. Defaults to FULL_LOAD_AND_CDC.
 */
const getMigrationType = (): MigrationTypeValue => {
  const { FULL_LOAD, FULL_LOAD_AND_CDC, CDC } = MigrationTypeValue;
  const args = process.argv.slice(3);
  for(const arg of args) {
    if([ FULL_LOAD, FULL_LOAD_AND_CDC, CDC ].some(v => equalsIgnoreCase(v, arg))) {
      return arg as MigrationTypeValue;
    }
  }
  return FULL_LOAD_AND_CDC;
}

/**
 * @returns The custom CDC start position if provided, otherwise undefined.
 */
const getCustomCdcStartPosition = (): Date | undefined => {
  const args = process.argv.slice(3);
  const isISODate = (s:string): boolean => {
    const ISOFormat = 'yyyy-MM-ddTHH:mm:ss'; // Example format
    const ISORegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    if(s.length < ISOFormat.length) {
      return false;
    }
    const datePart = s.substring(0, ISOFormat.length);
    if( ! ISORegex.test(datePart)) {
      return false;
    }
    if(isNaN((new Date(s)).getTime())) {
      return false;
    }
    return true;
  }

  for(const arg of args) {
    const date = new Date(arg);
    if( isISODate(arg) ) {
      return date;
    }
  }
  return undefined;
}

/**
 * Remove the next scheduled migration, which will interrupt and terminate the ongoing migration schedule.
 * @param context 
 * @returns 
 */
const cancelMigration = async (context:IContext) => {
  // Use the event bridge scheduler client to find schedules created by this app and cancel the next one.
  const { stack: { Id, Region:region, Tags: { Landscape } = {} } = {}} = context;
  const prefix = () => `${Id}-${Landscape}`;
  const client = new SchedulerClient({ region });
  const params = {
    GroupName: `${prefix()}-schedules`,
    State: ScheduleState.ENABLED,
    NamePrefix: prefix()
  } satisfies ListSchedulesCommandInput
  const output: ListSchedulesCommandOutput = await client.send(new ListSchedulesCommand(params));
  const { Schedules = [] } = output;
  if(Schedules.length === 0) {
    console.log(`No schedules found with prefix ${prefix()}. Nothing to cancel.`);
    return;
  }
  for await (const schedule of Schedules) {
    const { Name, GroupName } = schedule;
    console.log(`Deleting: ${JSON.stringify(schedule, null, 2)}`);
    PostExecution().cleanup(Name!, GroupName!);
  }

}

/**
 * Run this script as a shortcut to perform various tasks related to DMS replications, such as starting a
 * full load replication or creating a provisioned replication instance and task for testing purposes.
 */
(async () => {
  const context:IContext = await require('../context/context.json');
  const { START_FULL_LOAD, START_CDC_LOAD, CREATE_SERVERLESS, CREATE_PROVISIONED, CANCEL_MIGRATION } = FactoryTask;
  const tasks = Object.values(FactoryTask).join(", ");

  const task = process.argv[2];

  if( ! task) {
    console.error(`You must provide the name of the task to perform. Valid tasks are: ${tasks}`);
    process.exit(1);
  }

  switch(task) {

    /**
     * Create a serverless replication and start a full load replication based on it. Optionally, you can pass a 
     * single argument to specify a custom duration in minutes that the replication is expected to take. This
     * duration will be used to override the default configured durationForFullLoadMinutes.
     */
    case START_FULL_LOAD:
      const ReplicationType = getMigrationType();
      if(ReplicationType === MigrationTypeValue.CDC) {
        console.error(`The ${START_FULL_LOAD} task cannot be used with the CDC migration type.
          Valid migration types are: ${MigrationTypeValue.FULL_LOAD}, ${MigrationTypeValue.FULL_LOAD_AND_CDC}`);
        process.exit(1);
      }
      await startReplication({
          context,
          dryRun: isDryRun(),
          ReplicationType, 
          customDurationMinutes: getCustomDuration(),
          isSmokeTest: isSmokeTest(),
          skipReplicationStart: false,
          skipDeletionSchedule: false
        });
      break;

    case START_CDC_LOAD:
      const replicationType = getMigrationType();
      if(replicationType !== MigrationTypeValue.CDC) {
        console.error(`The ${START_CDC_LOAD} task can only be used with the CDC migration type.
          Valid migration type is: ${MigrationTypeValue.CDC}`);
        process.exit(1);
      }
      await startReplication({
          context, 
          dryRun: isDryRun(),
          ReplicationType: replicationType, 
          customDurationMinutes: getCustomDuration(),
          customCdcStartPosition: getCustomCdcStartPosition(),
          isSmokeTest: isSmokeTest(),
          skipReplicationStart: false,
          skipDeletionSchedule: false
        });
      break;

    /**
     * Create a provisioned replication instance and task to run it on for testing purposes
     * or...
     * Create a serverless replication configuration on which to base serverless migrations for testing purposes.
     */
    case CREATE_PROVISIONED: case CREATE_SERVERLESS:
      const { PROVISIONED, SERVERLESS } = TaskType;
      runTestHarness({
        replicationToCreate: isSmokeTest() ? new ReplicationToCreateSingleTable() : new ReplicationToCreate(),
        taskType: task === CREATE_PROVISIONED ? PROVISIONED : SERVERLESS,
        migrationType: getMigrationType(),
        dryrun: false,
      });
      break;

    /**
     * Cancel the next scheduled migration, which will interrupt and terminate the ongoing migration schedule.
     */
    case CANCEL_MIGRATION:
      await cancelMigration(context);
      break;

    default:
      console.error(`Unknown task: ${task}. Valid tasks are: ${tasks}`);
      process.exit(1);
  }
})();