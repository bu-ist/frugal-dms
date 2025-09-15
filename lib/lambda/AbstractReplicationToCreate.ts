import { CreateReplicationConfigCommandInput, CreateReplicationInstanceCommandInput, CreateReplicationInstanceCommandOutput, CreateReplicationTaskCommandInput, DatabaseMigrationService, MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { TableMapping } from "../TableMappings";
import { getReplicationCreateEnvironmentVariables, ReplicationCreateEnvironmentVariables } from "./ReplicationEnvironment";
import { lookupDmsEndpoinArn, lookupSecurityGroupId, lookupVpcAvailabilityZones } from "./Utils";
import { TaskType } from "./Replication";

export type CreateReplicationParms = {
  taskType: TaskType;
  ReplicationType: MigrationTypeValue;
  dryrun?: boolean;
}

/**
 * Create a replication configuration for serverless DMS replications.
 */
export abstract class AbstractReplicationToCreate {
  _createEnvVars: ReplicationCreateEnvironmentVariables;
  _suffixDate: Date = new Date();
  _suffix: string = this._suffixDate.toISOString().replace(/[\:\.]/g, '-');
  _replicationType: MigrationTypeValue;

  constructor(createEnvVars?:ReplicationCreateEnvironmentVariables) {
    this._createEnvVars = createEnvVars ?? getReplicationCreateEnvironmentVariables();
  }

  protected abstract getReplicationSettings(): Promise<any>;

  protected abstract getTableMapping(): TableMapping;

  public create = async (parms: CreateReplicationParms): Promise<string> => {
    const { taskType, ReplicationType, dryrun=false } = parms;
    const { SERVERLESS, PROVISIONED } = TaskType;
    switch(taskType) {
      case SERVERLESS:
        return this.createServerlessReplication(ReplicationType, dryrun);
      case PROVISIONED:
        return this.createProvisionedReplication(ReplicationType, dryrun);
      default:
        throw new Error(`Invalid or missing task type: ${taskType}`);
    }
  }

  protected createServerlessReplication = async (ReplicationType: MigrationTypeValue, dryrun:boolean = false): Promise<string> => {
    if( ! this._createEnvVars.isValid()) {
      throw new Error('Invalid replication creation environment variables');
    }

    this._replicationType = ReplicationType;
    const { prefix } = this._createEnvVars;
    const dms = new DatabaseMigrationService();
    const ReplicationConfigIdentifier = `${prefix}-${ReplicationType.toLowerCase()}-${this._suffix}`;
    const { 
      getReplicationSettings, getTableMapping, trimResourceIdentifier, _suffixDate, _createEnvVars: { 
        sourceEndpointArn:SourceEndpointArn, targetEndpointArn:TargetEndpointArn, vpcSecurityGroupId,
        replicationAvailabilityZone:AvailabilityZone, replicationSubnetGroupId:ReplicationSubnetGroupId
      } 
    } = this;

    const input = {
      ReplicationConfigIdentifier,
      ResourceIdentifier: trimResourceIdentifier(`${prefix}-${_suffixDate.getTime()}`), // must be unique AND <= 31 characters
      ReplicationType,
      SourceEndpointArn,
      TargetEndpointArn,
      ReplicationSettings: JSON.stringify(await getReplicationSettings()),
      TableMappings: getTableMapping().toFlatString(),
      ComputeConfig: {
        ReplicationSubnetGroupId,
        MultiAZ: false,
        MaxCapacityUnits: 8,
        MinCapacityUnits: 2,
        AvailabilityZone,
        VpcSecurityGroupIds: [ vpcSecurityGroupId ]
      }
    } as CreateReplicationConfigCommandInput

    console.log('Creating replication configuration with settings:', JSON.stringify(input, null, 2));

    if(dryrun) {
      console.log('DRYRUN: skipping execution');
      return '';
    }

    const output = await dms.createReplicationConfig(input);

    const { ReplicationConfig: { ReplicationConfigArn:arn } = {} } = output;
    if ( ! arn ) {
      throw new Error('Failed to create the replication configuration');
    }
    return arn;
  }

  protected createProvisionedReplication = async (ReplicationType: MigrationTypeValue, dryrun:boolean = false): Promise<string> => {
    if( ! this._createEnvVars.isValid()) {
      throw new Error('Invalid replication creation environment variables');
    }
    this._replicationType = ReplicationType;
    const { prefix } = this._createEnvVars;
    const dms = new DatabaseMigrationService();

    const { 
      getReplicationSettings, getTableMapping, _suffixDate, trimResourceIdentifier, _createEnvVars: { 
        sourceEndpointArn:SourceEndpointArn, targetEndpointArn:TargetEndpointArn, vpcSecurityGroupId,
        replicationAvailabilityZone:AvailabilityZone, replicationSubnetGroupId:ReplicationSubnetGroupId
      } 
    } = this;

    const suffix = _suffixDate.getTime();

    const cricInput = {
      ReplicationInstanceIdentifier: `${prefix}-instance`,
      ResourceIdentifier: trimResourceIdentifier(`${prefix}-instance-${suffix}`), // must be unique AND <= 31 characters
      ReplicationInstanceClass: 'dms.t3.medium',
      AllocatedStorage: 50,
      VpcSecurityGroupIds: [ vpcSecurityGroupId ],
      AvailabilityZone,
      PubliclyAccessible: false,
      ReplicationSubnetGroupIdentifier: ReplicationSubnetGroupId,
      MultiAZ: false
    } satisfies CreateReplicationInstanceCommandInput

    const crtInput = {
      ReplicationTaskIdentifier: `${prefix}-task`,
      ResourceIdentifier: trimResourceIdentifier(`${prefix}-task-${suffix}`), // must be unique AND <= 31 characters
      SourceEndpointArn,
      TargetEndpointArn,
      MigrationType: ReplicationType,
      ReplicationInstanceArn: '[instanceArn]', // Placeholder, will be replaced after instance creation
      TableMappings: getTableMapping().toFlatString(),
      ReplicationTaskSettings: JSON.stringify(await getReplicationSettings())
    } satisfies CreateReplicationTaskCommandInput

    console.log('Creating resources with settings:', JSON.stringify({
      CreateReplicationInstanceCommandInput: cricInput, 
      CreateReplicationTaskCommandInput: crtInput 
    }, null, 2));

    if(dryrun) {
      console.log('DRYRUN: skipping execution');
      return '';
    }

    const cricOutput = await dms.createReplicationInstance(cricInput) satisfies CreateReplicationInstanceCommandOutput;

    const instanceArn = cricOutput.ReplicationInstance?.ReplicationInstanceArn;
    if ( ! instanceArn ) {
      throw new Error('Failed to create the replication instance');
    }

    crtInput.ReplicationInstanceArn = instanceArn;

    const crtOutput = await dms.createReplicationTask(crtInput);

    const { ReplicationTask: { ReplicationTaskArn: arn } = {} } = crtOutput;
    if ( ! arn ) {
      throw new Error('Failed to create the replication task');
    }
    return arn;
  }
  
  /**
   * Trims the resource identifier to ensure it is unique and <= 31 characters.
   * It is the landscape portion of prefix that gets trimmed.
   * @param str 
   * @returns 
   */
  private trimResourceIdentifier = (str:string) => {
    if(str.length <= 31) return str;
    const segments = str.split('-');
    const prefix = segments.slice(0, 2).join('-') + '-';
    const suffix = '-' + segments.slice(3).join('-');
    const maxThirdLen = 31 - (prefix.length + suffix.length);
    // Clip the third segment if needed
    segments[2] = segments[2].slice(0, Math.max(0, maxThirdLen));
    return [segments[0], segments[1], segments[2], ...segments.slice(3)].join('-');
  }

  public set createEnvVars(envVars:ReplicationCreateEnvironmentVariables) {
    this._createEnvVars = envVars;
  }
  public get suffix(): string {
    return this._suffix;
  }
  public get replicationType(): MigrationTypeValue {
    return this._replicationType;
  }
  public get validCreateEnvironmentVariables(): boolean {
    return this._createEnvVars.isValid();
  }
}

export type TestHarnessParms = {
  replicationToCreate: AbstractReplicationToCreate;
  taskType: TaskType;
  migrationType: MigrationTypeValue;
  dryrun?: boolean;
};

export const runTestHarness = async (params: TestHarnessParms) => {
  const { replicationToCreate, taskType, migrationType, dryrun=false } = params;
  const context:IContext = await require('../../context/context.json');
  const { 
    stack: { Tags: { Landscape } = {}, Id } = {},
    sourceDbEngineName,
    sourceDbLargestLobKB=7000,
    sourceDbTestTables,
    sourceDbSchemas,
    sourceDbVpcId,
    postgresSchema
  } = context;
  const prefix = () => `${Id}-${Landscape}`;

  // Needed to create the replication config
  process.env.ACTIVE = 'true';
  process.env.PREFIX = `${prefix()}`;
  process.env.SOURCE_DB_ENGINE_NAME = sourceDbEngineName;
  process.env.SOURCE_ENDPOINT_ARN = await lookupDmsEndpoinArn(`${prefix()}-source-endpoint`);
  process.env.SOURCE_TEST_TABLES = JSON.stringify(sourceDbTestTables);
  process.env.SOURCE_DB_SCHEMAS = JSON.stringify(sourceDbSchemas);
  process.env.TARGET_ENDPOINT_ARN = await lookupDmsEndpoinArn(`${prefix()}-target-endpoint`);
  process.env.REPLICATION_SUBNET_GROUP_ID = `${prefix()}-subnet-group`;
  process.env.REPLICATION_AVAILABILITY_ZONE = (await lookupVpcAvailabilityZones(`${sourceDbVpcId}`))[0];
  process.env.VPC_SECURITY_GROUP_ID = await lookupSecurityGroupId(`${prefix()}-vpc-sg`);
  process.env.LARGEST_SOURCE_LOB_KB = `${sourceDbLargestLobKB}`;
  process.env.POSTGRES_DB_SCHEMA = postgresSchema;

  replicationToCreate.createEnvVars = getReplicationCreateEnvironmentVariables();

  await replicationToCreate.create({ 
    taskType, ReplicationType:migrationType, dryrun 
  });

  console.log('Done');
}
