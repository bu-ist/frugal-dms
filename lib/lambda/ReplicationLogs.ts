import { CloudWatchLogsClient, DescribeLogGroupsCommand, DescribeLogGroupsCommandInput, DescribeLogGroupsCommandOutput, DescribeLogStreamsCommand, DescribeLogStreamsCommandInput, DescribeLogStreamsCommandOutput, LogGroup, PutRetentionPolicyCommand } from '@aws-sdk/client-cloudwatch-logs';
import { IContext } from '../../context/IContext';

export type ReplicationLogsParms = {
  prefix: string;
  suffix?: string; 
  region?: string;
  dryRun?: boolean;
}

/**
 * By default, DMS serverless replications create CloudWatch log groups without a log retention policy,
 * which means the logs are kept indefinitely. This class can be used to find those log groups and apply
 * a log retention policy to them, and keep them from piling up over time.
 */
export class ReplicationCloudWatchLogs {

  private _logGroups: LogGroup[] = [];
  private _region: string;
  private _logGroupNamePattern: string;
  private _dryRun: boolean;

  public static logGroupNameBase = (prefix: string = ''): string => `dms-serverless-replication${prefix ? '-' + prefix : ''}`;

  constructor(parms: ReplicationLogsParms) {
    const { suffix, prefix, region='us-east-1', dryRun=false } = parms;
    this._dryRun = dryRun;
    this._region = region;
    this._logGroupNamePattern = ReplicationCloudWatchLogs.logGroupNameBase(prefix);
    this._logGroupNamePattern += `-${suffix ?? '*'}`;
  }

  /**
   * @param days Number of days to retain the logs. Acceptable values are: 1, 3, 5, 7, 14, 30, 60, 90, 
   * 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, and 3653
   */
  public setRetentionDays = async (days: number): Promise<void> => {
    const acceptableValues = [ 1, 3, 5, 7, 14, 30, 60, 90, 
      120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653 ];
    if( ! acceptableValues.includes(days)) {
      throw new Error(`Invalid number of days for log retention: ${days}. Acceptable values are: ${acceptableValues.join(', ')}`);
    }

    const { logGroupNamePattern, getLogGroups } = this;

    const logGroups = await getLogGroups();

    if(logGroups.length === 0) {
      console.warn(`No log group(s) found matching "${logGroupNamePattern}" that have no log retention policy. 
        Cannot set retention policy.`);
      return;
    }

    const client = new CloudWatchLogsClient({ region: this._region });

    for(const logGroup of logGroups) {
      if(this._dryRun) {
        console.log(`[DRY RUN] Would set log retention policy of ${days} days for log group ${logGroup.logGroupName}`);
        continue;
      }
      // Apply the retention policy
      await client.send(new PutRetentionPolicyCommand({
        logGroupName: logGroup.logGroupName!,
        retentionInDays: days
      }));
      console.log(`Set log retention policy of ${days} days for log group ${logGroup.logGroupName}`);
    }
  }
  
  public getLogGroups = async (): Promise<LogGroup[]> => {
    const { logGroupNamePattern, _logGroups, region } = this;

    if(_logGroups.length > 0) {
      return _logGroups;
    }

    // Use the SDK to query for a set of log groups whose name or ID starts with "dms-serverless-replication-"
    const client = new CloudWatchLogsClient({ region });

    // Repeat lookups using tokenized retrieval to get all log groups
    let nextToken: string | undefined = undefined;
    do {
      const command: DescribeLogGroupsCommand = new DescribeLogGroupsCommand({
        logGroupNamePattern,
        limit: 50,
        nextToken
      } satisfies DescribeLogGroupsCommandInput);
      const response = await client.send(command) satisfies DescribeLogGroupsCommandOutput;
      const logGroups = response.logGroups || [];
      for(const logGroup of logGroups) {
        const { retentionInDays=0} = logGroup;
        // The log group must be missing a log retention policy to qualify.
        if(retentionInDays === 0) {
          _logGroups.push(logGroup);
        }
      }
      nextToken = response.nextToken;
    } while (nextToken);

    return _logGroups;
  }

  public get logGroupNamePattern(): string {
    return this._logGroupNamePattern;
  }
  public get logGroups(): LogGroup[] {
    return this._logGroups;
  }
  public get region(): string {
    return this._region;
  }
}



/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationLogs.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    const { stack: { Region:region, Tags: { Landscape } = {}, Id } = {} } = context;
    const prefix = () => `${Id}-${Landscape}`;
    
    const replicationLogs = new ReplicationCloudWatchLogs({
      // prefix: prefix(), suffix: '1759384802120', region, dryRun: false
      prefix: prefix(), suffix: undefined, region, dryRun: false
    });

    await replicationLogs.setRetentionDays(60);
  })();
}