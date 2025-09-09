import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { AbstractFunction } from "../AbstractFunction";
import { Duration } from "aws-cdk-lib";
import { IContext } from "../../context/IContext";

export type StartReplicationTaskLambdaFunctionProps = {
  context: IContext;
  fullLoadConfigArn?: string;
  fullLoadAndCdcConfigArn?: string;
  cdcOnlyConfigArn?: string;
};

export class StartReplicationTaskLambdaFunction extends AbstractFunction {

  constructor(scope: Construct, constructId: string, props: StartReplicationTaskLambdaFunctionProps) {
    const { fullLoadConfigArn, fullLoadAndCdcConfigArn, cdcOnlyConfigArn, context: { 
        stack: { prefix=()=>'undefined' } = {}, scheduledRunRetryOnFailure, 
        oracleRedoLogRetentionHours, scheduledRunAbortIfBeyondRedoLogRetention, scheduledRunDurationMinutes
      },       
    } = props;

    if( ! fullLoadConfigArn && ! fullLoadAndCdcConfigArn) {
      throw new Error('At least one of fullLoadConfigArn or fullLoadAndCdcConfigArn is required for StartReplicationTaskLambdaFunction');
    }
    if( ! cdcOnlyConfigArn ) {
      throw new Error('cdcOnlyConfigArn is required for StartReplicationTaskLambdaFunction');
    }

    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/LambdaHandler.ts',
      // handler: 'handler',
      functionName: `${prefix()}-start-replication-task`,
      description: 'Triggers the DMS replication task between the source oracle and target postgres databases.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'start-replication-task-role', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the lambda function to perform the related DMS tasks.`,
        inlinePolicies: {
          'DmsStartReplicationTaskPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'dms:StartReplicationTask', 'dms:DescribeReplicationTasks' ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              })
            ]
          }),
        }
      }),
      environment: {
        FULL_LOAD_CONFIG_ARN: fullLoadConfigArn ?? '',
        FULL_LOAD_AND_CDC_CONFIG_ARN: fullLoadAndCdcConfigArn ?? '',
        CDC_ONLY_CONFIG_ARN: cdcOnlyConfigArn ?? '',
        IGNORE_LAST_ERROR: scheduledRunRetryOnFailure ? 'true' : 'false',
        SOURCE_DB_REDO_LOG_RETENTION_HOURS: `${oracleRedoLogRetentionHours ?? '0'}`,
        ABORT_IF_BEYOND_REDO_LOG_RETENTION: scheduledRunAbortIfBeyondRedoLogRetention ? 'true' : 'false',
        REPLICATION_DURATION_MINUTES: `${scheduledRunDurationMinutes ?? '45'}`,
        NEVER_ABORT: 'false',
        ACTIVE: 'false' // The lambda will abort early if this is not set to 'true'
      }
    });
  }

  // You can add more methods or properties specific to LambdaFunction here
}

