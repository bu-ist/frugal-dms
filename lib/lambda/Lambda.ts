import { Duration } from "aws-cdk-lib";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { ScheduleGroup } from "aws-cdk-lib/aws-scheduler";
import { Construct } from "constructs";
import { IContext } from "../../context/IContext";
import { AbstractFunction } from "../AbstractFunction";
import { DmsEndpoints } from "../Endpoint";
import { DmsVpc } from "../Vpc";


export type StartStopLambdasProps = {
  id: string;
  scope: Construct;
  context: IContext;
  dmsVpc: DmsVpc;
  dmsEndpoints: DmsEndpoints;
  replicationSubnetGroupId: string;
};

export class StartStopLambdas extends Construct {
  private props: StartStopLambdasProps;
  private _startReplicationLambda: AbstractFunction;
  private _stopReplicationLambda: AbstractFunction;
  private scheduleGroupName: string;
  private startReplicationFunctionName: string;
  private stopReplicationFunctionName: string;

  constructor(props: StartStopLambdasProps) {
    super(props.scope, props.id);
    this.props = props;

    const { context: { stack: { prefix=()=>'undefined' } = {}, }} = props;

    this.startReplicationFunctionName = `${prefix()}-start-replication-task`;
    this.stopReplicationFunctionName = `${prefix()}-stop-replication-task`;

    this.createEventSchedulerGroup();

    this.createSchedulesRole();

    this.createStartReplicationLambda();

    this.createStopReplicationLambda();
  }

  /**
   * Create the event bridge scheduler group for the delayed executions of starting and stopping replications
   */
  private createEventSchedulerGroup = () => {
    const { props: { context: { stack: { prefix=()=>'undefined' } = {} } } } = this;
    this.scheduleGroupName = `${prefix()}-schedules`;
    new ScheduleGroup(this, 'schedule-group', { scheduleGroupName: this.scheduleGroupName });
  }

  /**
   * Create the role that allows event bridge scheduler to invoke the start and stop replication lambdas
   */
  private createSchedulesRole = () => {
    const { props: { context: { stack: { Account, Region, prefix=()=>'undefined' } = {} } } } = this;

    new Role(this, 'scheduler-role', {
      roleName: `${prefix()}-scheduler-role`,
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'), // Trust policy for EventBridge Scheduler
      description: 'Role for EventBridge Scheduler to invoke start and stop replication lambda',
      inlinePolicies: {
        'EventBridgeSchedulerPolicy': new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: [
                `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-*`
              ],
              effect: Effect.ALLOW
            })
          ]
        })
      }
    });
  }

  /**
   * Create the lambda function that starts a DMS replication.
   */
  private createStartReplicationLambda = () => {
    const { 
      scheduleGroupName, startReplicationFunctionName:functionName, stopReplicationFunctionName,
      props: { 
        replicationSubnetGroupId, dmsVpc, dmsEndpoints: { 
          sourceEndpointArn, targetEndpointArn 
        }, context: {
          stack: { Account, Region, prefix=()=>'undefined' } = {}, scheduleRateHours=24,
          oracleLargestLobKB, oracleRedoLogRetentionHours, oracleTestTables, oracleSourceSchemas,
          scheduledRunAbortIfBeyondRedoLogRetention, scheduledRunDurationMinutes, scheduledRunRetryOnFailure,
        },       
      }} = this;

    this._startReplicationLambda = new class extends AbstractFunction { }(this, `start-replication-lambda`, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/StartReplicationHandler.ts',
      // handler: 'handler',
      functionName,
      description: 'Triggers the DMS replication between the source oracle and target postgres databases.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'start-replication-task-role', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the lambda function to perform the related DMS tasks.`,
        inlinePolicies: {
          [`${functionName}-dms-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'dms:CreateReplicationConfig' ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule' ],
                resources: [
                  `arn:aws:scheduler:${Region}:${Account}:schedule/${scheduleGroupName}/start-replication-*`
                ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        IGNORE_LAST_ERROR: scheduledRunRetryOnFailure ? 'true' : 'false',
        SOURCE_DB_REDO_LOG_RETENTION_HOURS: `${oracleRedoLogRetentionHours ?? '0'}`,
        ABORT_IF_BEYOND_REDO_LOG_RETENTION: scheduledRunAbortIfBeyondRedoLogRetention ? 'true' : 'false',
        // REPLICATION_DURATION_MINUTES: `${scheduledRunDurationMinutes ?? '45'}`,
        REPLICATION_SUBNET_GROUP_ID: replicationSubnetGroupId,
        REPLICATION_AVAILABILITY_ZONE: dmsVpc.vpc.availabilityZones[0], // Let DMS pick the AZ
        REPLICATION_SCHEDULE_RATE_HOURS: `${scheduleRateHours}`,
        VPC_SECURITY_GROUP_ID: dmsVpc.sg.securityGroupId,
        SOURCE_ENDPOINT_ARN: sourceEndpointArn,
        TARGET_ENDPOINT_ARN: targetEndpointArn,
        LARGEST_SOURCE_LOB_KB: `${oracleLargestLobKB}`,
        SOURCE_TEST_TABLES: JSON.stringify(oracleTestTables),
        SOURCE_SCHEMAS: JSON.stringify(oracleSourceSchemas),
        STOP_REPLICATION_FUNCTION_ARN: `arn:aws:lambda:${Region}:${Account}:function:${stopReplicationFunctionName}`,
        NEVER_ABORT: 'false',
        ACTIVE: 'false' // The lambda will abort early if this is not set to 'true'
      }
    });
  }

  private createStopReplicationLambda = () => {
    const { scheduleGroupName, startReplicationFunctionName, stopReplicationFunctionName:functionName,
      props: {context: { stack: { Account, Region, prefix=()=>'undefined' } = {} } } 
    } = this;

    this._stopReplicationLambda = new class extends AbstractFunction { }(this, `stop-replication-lambda`, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/StopReplicationHandler.ts',
      // handler: 'handler',
      functionName,
      description: 'Stops and deletes the DMS replication between the source oracle and target postgres databases.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'stop-replication-task-role', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the lambda function to perform the related DMS tasks.`,
        inlinePolicies: {
          'DmsStopReplicationTaskPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'dms:StopReplicationTask', 'dms:DescribeReplicationTasks' ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule' ],
                resources: [
                  `arn:aws:scheduler:${Region}:${Account}:schedule/${scheduleGroupName}/stop-replication-*`
                ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        START_REPLICATION_FUNCTION_ARN: `arn:aws:lambda:${Region}:${Account}:function:${startReplicationFunctionName}`,
        ACTIVE: 'false' // The lambda will abort early if this is not set to 'true'
      }
    });

  }

  public get startReplicationLambda(): AbstractFunction {
    return this._startReplicationLambda;
  }

  public get stopReplicationLambda(): AbstractFunction {
    return this._stopReplicationLambda;
  }

}
