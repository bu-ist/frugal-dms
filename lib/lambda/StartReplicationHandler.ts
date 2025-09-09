import { CreateReplicationConfigCommandInput, DatabaseMigrationService, StartReplicationCommandInput, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { getFutureDateString, log, TimeUnit } from "./Utils";
import { v4 as uuidv4 } from 'uuid';
import { ReplicationType } from "../Tasks";
import { ServerlessReplicationSettings } from "../ReplicationSetting";
import { TableMapping } from "../TableMappings";
import { asServerTimestamp } from "./Utils";
import { EggTimer, PeriodType } from "./timer/EggTimer";
import { StopReplicationHandlerInput } from "./StopReplicationHandler";
import { DatabaseTable } from "../../context/IContext";

export type StartReplicationHandlerInput = {
  CdcStartPosition: string;
  replicationDurationMinutes: number;
  isSmokeTest?: boolean;
};

type environmentParms = {
  ignoreLastError: boolean,
  sourceDbRedoLogRetentionHours: number,
  abortIfBeyondRedoLogRetention: boolean,
  neverAbort: boolean,
  ReplicationSubnetGroupId: string,
  replicationAvailabilityZone: string,
  vpcSecurityGroupId: string,
  SourceEndpointArn: string,
  TargetEndpointArn: string,
  largestSourceLobKB: number,
  sourceDbSchemas: string[],
  sourceDbTestTables: DatabaseTable[],
  stopReplicationFunctionArn: string,
  replicationScheduleRateHours: number
}

export const handler = async (event:ScheduledLambdaInput):Promise<any> => {
  const { lambdaInput, groupName, scheduleName } = event;
  const { CdcStartPosition, replicationDurationMinutes=60, isSmokeTest=false } = lambdaInput as StartReplicationHandlerInput;
  const {
    ignoreLastError, sourceDbRedoLogRetentionHours, abortIfBeyondRedoLogRetention, neverAbort,
    ReplicationSubnetGroupId, replicationAvailabilityZone:AvailabilityZone, vpcSecurityGroupId,
    SourceEndpointArn, TargetEndpointArn, largestSourceLobKB, replicationScheduleRateHours,
    sourceDbSchemas, sourceDbTestTables, stopReplicationFunctionArn
  } = getEnvironmentParms();

  try {
    log(event, 'Processing with the following event');

    const dms = new DatabaseMigrationService();
    const ReplicationConfigIdentifier = `start-replication-${uuidv4()}`;
    const ReplicationSettings = Object.assign({}, ServerlessReplicationSettings);
    if(largestSourceLobKB > 0) {
      ReplicationSettings.TargetMetadata = {
        ...ReplicationSettings.TargetMetadata,
        LobMaxSize: largestSourceLobKB
      };
    }

    // Define the table mapping
    let tableMapping:TableMapping;
    if(isSmokeTest) {
      if(sourceDbTestTables.length == 0) {
        throw new Error('No test tables specified for smoke test');
      }
      tableMapping = TableMapping
        .includeTestTables(sourceDbTestTables)
        .lowerCaseTargetTableNames();
    }
    else {
      if(sourceDbSchemas.length == 0) {
        throw new Error('No source schemas specified');
      }
      tableMapping = new TableMapping()
        .includeSchemas(sourceDbSchemas)
        .lowerCaseTargetTableNames()
    }
    
    // Create the replication configuration
    const output = await dms.createReplicationConfig({
      ReplicationConfigIdentifier,
      ReplicationType: ReplicationType.CDC,
      SourceEndpointArn,
      TargetEndpointArn,
      ReplicationSettings,
      TableMappings: tableMapping.toJSON(),
      ComputeConfig: {
        ReplicationSubnetGroupId,
        MultiAZ: false,
        MaxCapacityUnits: 8,
        MinCapacityUnits: 2,
        AvailabilityZone,
        VpcSecurityGroupIds: [ vpcSecurityGroupId ]
      }
    } as CreateReplicationConfigCommandInput);

    const { ReplicationConfig: { ReplicationConfigArn } = {}} = output;
    if ( ! ReplicationConfigArn ) {
      throw new Error('Failed to create the replication configuration');
    }

    // Get the stop time for the replication
    const CdcStopPosition = asServerTimestamp(getFutureDateString(replicationDurationMinutes, TimeUnit.MINUTE));

    // Start a replication based on the configuration
    await dms.startReplication({
      ReplicationConfigArn,
      CdcStartPosition,
      CdcStopPosition,
      StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION,      
    } as StartReplicationCommandInput);

    // Create a delayed execution that targets a lambda that will delete the replication started above.
    // It should be in a stopped state by the time this runs.
    const delayedTestExecution = new DelayedLambdaExecution(stopReplicationFunctionArn, {
      scheduleName: `stop-replication-${uuidv4()}`, groupName, lambdaInput: {
        ReplicationConfigArn,
        LastCdcStartPosition: CdcStartPosition,
        LastCdcStopPosition: CdcStopPosition,
        LastReplicationDurationMinutes: replicationDurationMinutes,
        wasSmokeTest: isSmokeTest
      } as StopReplicationHandlerInput
    } as ScheduledLambdaInput);
    const timer = EggTimer.getInstanceSetFor(replicationScheduleRateHours, PeriodType.HOURS);
    await delayedTestExecution.startCountdown(timer, 'testing-one-two-three', 'Testing one two three');
    
  }
  catch(e:any) {    
    log(e);
  }
  finally {
    // Delete the schedule that triggered this execution.
    await PostExecution().cleanup(scheduleName, groupName);    
  }
};  


const getEnvironmentParms = ():environmentParms => {
  const {
    IGNORE_LAST_ERROR,
    SOURCE_DB_REDO_LOG_RETENTION_HOURS,
    ABORT_IF_BEYOND_REDO_LOG_RETENTION,
    NEVER_ABORT,
    REPLICATION_SUBNET_GROUP_ID,
    REPLICATION_AVAILABILITY_ZONE,
    VPC_SECURITY_GROUP_ID,
    SOURCE_ENDPOINT_ARN,
    TARGET_ENDPOINT_ARN,
    LARGEST_SOURCE_LOB_KB,
    SOURCE_SCHEMAS,
    SOURCE_TEST_TABLES,
    STOP_REPLICATION_FUNCTION_ARN,
    REPLICATION_SCHEDULE_RATE_HOURS
  } = process.env;

  
  if( ! STOP_REPLICATION_FUNCTION_ARN) {
    throw new Error('Missing STOP_REPLICATION_FUNCTION_ARN environment variable');
  }
  if( ! REPLICATION_SUBNET_GROUP_ID) {
    throw new Error('Missing REPLICATION_SUBNET_GROUP_ID environment variable');
  }
  if( ! REPLICATION_AVAILABILITY_ZONE) {
    throw new Error('Missing REPLICATION_AVAILABILITY_ZONE environment variable');
  }
  if( ! VPC_SECURITY_GROUP_ID) {
    throw new Error('Missing VPC_SECURITY_GROUP_ID environment variable');
  }
  if( ! SOURCE_ENDPOINT_ARN) {
    throw new Error('Missing SOURCE_ENDPOINT_ARN environment variable');
  }
  if( ! TARGET_ENDPOINT_ARN) {
    throw new Error('Missing TARGET_ENDPOINT_ARN environment variable');
  }
  if( ! SOURCE_DB_REDO_LOG_RETENTION_HOURS) {
    throw new Error('Missing SOURCE_DB_REDO_LOG_RETENTION_HOURS environment variable');
  }

  return {
    ignoreLastError: IGNORE_LAST_ERROR ? IGNORE_LAST_ERROR.toLowerCase() === 'true' : false,
    sourceDbRedoLogRetentionHours: SOURCE_DB_REDO_LOG_RETENTION_HOURS ? parseInt(SOURCE_DB_REDO_LOG_RETENTION_HOURS) : 0,
    abortIfBeyondRedoLogRetention: ABORT_IF_BEYOND_REDO_LOG_RETENTION ? ABORT_IF_BEYOND_REDO_LOG_RETENTION.toLowerCase() === 'true' : true,
    neverAbort: NEVER_ABORT ? NEVER_ABORT.toLowerCase() === 'true' : false,
    ReplicationSubnetGroupId: REPLICATION_SUBNET_GROUP_ID!,
    replicationAvailabilityZone: REPLICATION_AVAILABILITY_ZONE!,
    vpcSecurityGroupId: VPC_SECURITY_GROUP_ID!,
    SourceEndpointArn: SOURCE_ENDPOINT_ARN!,
    TargetEndpointArn: TARGET_ENDPOINT_ARN!,
    largestSourceLobKB: LARGEST_SOURCE_LOB_KB ? parseInt(LARGEST_SOURCE_LOB_KB) : 0,
    sourceDbSchemas: SOURCE_SCHEMAS ? JSON.parse(SOURCE_SCHEMAS) : [],
    sourceDbTestTables: SOURCE_TEST_TABLES ? JSON.parse(SOURCE_TEST_TABLES) : [],
    stopReplicationFunctionArn: STOP_REPLICATION_FUNCTION_ARN!,
    replicationScheduleRateHours: REPLICATION_SCHEDULE_RATE_HOURS ? parseInt(REPLICATION_SCHEDULE_RATE_HOURS) : 24
  };
}
