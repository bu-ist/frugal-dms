import { Duration } from "aws-cdk-lib";
import { Rule, RuleProps, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { StartReplicationTaskLambdaFunction } from "./lambda_old/Lambda";

export type DmsRuleProps = {
  scope:Construct;
  constructId:string;
  context:IContext;
  dmsLambdaFunction: StartReplicationTaskLambdaFunction;
};

/**
 * Build the DMS serverless replication instance.
 */
export class DmsRule extends Construct {
  private _rule:Rule

  constructor(props: DmsRuleProps) {
    super(props.scope, props.constructId);

    const { constructId:id, dmsLambdaFunction, context } = props;

    const { stack: { prefix=()=>'undefined' } = {}, scheduleRateHours=24 } = context;

    this._rule = new Rule(this, `${prefix()}-${id}`, {
      schedule: Schedule.rate(Duration.hours(scheduleRateHours)),
      description: 'Daily DMS replication task start',
      enabled: false, // Set to false initially, can be enabled later
      ruleName: `${prefix()}-${id}-rule`,
    } as RuleProps);

    this._rule.addTarget(new LambdaFunction(dmsLambdaFunction, {
      maxEventAge: Duration.hours(2), // Optional: set the maxEventAge retry policy
      retryAttempts: 2, // Optional: set the max number of retry attempts
    }));
  }

  public get rule(): Rule {
    return this._rule;
  }
  public get arn(): string {
    return this._rule.ruleArn;
  }
}
