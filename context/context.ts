import { InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { IContext, PostgresInstanceIngress, DatabaseTable, StackParameters } from './IContext';
import * as ctx from './context.json';

export class Context implements IContext {

  public stack:StackParameters;
  public serverless: boolean;
  public scheduledRunRetryOnFailure?: boolean;
  public scheduledRunAbortIfBeyondRedoLogRetention?: boolean;
  public scheduledRunDurationMinutes?: number;
  public scheduleRateHours?: number;
  public publicSubnetIds?: string[];

  /* ----------------- ORACLE SOURCE ----------------- */
  // Connection
  public oracleHost: string;
  public oraclePort: number;
  public oracleUser: string;
  public oraclePassword: string|undefined;
   // Infrastructure
  public oracleSecretName?: string;
  public oracleSecurityGroupId?: string;
  public oracleVpcId?: string;
  public oracleSubnetIds?: string[];
  public oracleRedoLogRetentionHours?: number | undefined;
  // Replication configuration
  public oracleTestTables?: DatabaseTable[];
  public oracleSourceSchemas: string[];
  public oracleLargestLobKB?: number;

/* ----------------- POSTGRES TARGET ----------------- */
  // Connection
  public postgresHost: string;
  public postgresPort: number;
  public postgresDbName: string;
  public postgresSchema: string;
  public postgresPassword: string|undefined;
  // Infrastructure 
  public postgresSecretName?: string;
  public postgresInstanceSize?: InstanceSize;
  public postgresInstanceIngress?: PostgresInstanceIngress[]; // CIDR blocks to allow inbound traffic to the RDS instance

  constructor() {

    // Passwords from the environment take precedence over context.json
    const { ORACLE_PSWD, PG_PSWD } = process.env;


    // Fallback to context.json values
    const context:IContext = <IContext>ctx;
    const {
      stack: { Id, Account, Region, Tags: { Service, Function, Landscape } = {} } = {},
      oracleHost, oraclePort, oracleUser, oraclePassword, oracleSecretName, oracleSecurityGroupId,
      oracleVpcId, oracleSubnetIds, oracleTestTables, oracleSourceSchemas, oracleLargestLobKB, 
      oracleRedoLogRetentionHours, scheduledRunAbortIfBeyondRedoLogRetention, scheduledRunDurationMinutes,

      postgresDbName, postgresHost, postgresPort, postgresSchema, postgresPassword, 
      postgresSecretName, postgresInstanceSize, postgresInstanceIngress, publicSubnetIds,

      scheduleRateHours, scheduledRunRetryOnFailure=true, serverless=true
    } = context;

    this.stack = { Id, Account, Region, Tags: { Service, Function, Landscape }, prefix: () => {
      return `${Id}-${Landscape}`;
    }} as StackParameters;

    this.oracleHost = oracleHost;
    this.oraclePort = oraclePort;
    this.oracleUser = oracleUser;
    this.oraclePassword = oraclePassword || ORACLE_PSWD;
    this.oracleSecretName = oracleSecretName;
    this.oracleSecurityGroupId = oracleSecurityGroupId;
    this.oracleVpcId = oracleVpcId;
    this.oracleSubnetIds = oracleSubnetIds;
    this.oracleTestTables = oracleTestTables;
    this.oracleSourceSchemas = oracleSourceSchemas;
    this.oracleLargestLobKB = oracleLargestLobKB;
    this.oracleRedoLogRetentionHours = oracleRedoLogRetentionHours;

    this.postgresDbName = postgresDbName;
    this.postgresHost = postgresHost;
    this.postgresPort = postgresPort;
    this.postgresSchema = postgresSchema;
    this.postgresPassword = postgresPassword || PG_PSWD;
    this.postgresSecretName = postgresSecretName;
    this.postgresInstanceSize = postgresInstanceSize;
    this.postgresInstanceIngress = postgresInstanceIngress;

    this.serverless = serverless;
    this.scheduleRateHours = scheduleRateHours;
    this.scheduledRunRetryOnFailure = scheduledRunRetryOnFailure;
    this.scheduledRunAbortIfBeyondRedoLogRetention = scheduledRunAbortIfBeyondRedoLogRetention;
    this.scheduledRunDurationMinutes = scheduledRunDurationMinutes;
    this.publicSubnetIds = publicSubnetIds;
  }
}