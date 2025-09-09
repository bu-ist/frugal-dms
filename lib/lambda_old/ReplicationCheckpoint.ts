import { DatabaseMigrationService, DescribeReplicationTableStatisticsCommandInput, DescribeTableStatisticsCommandInput } from "@aws-sdk/client-database-migration-service";


// Some AWS regions/versions might support this
const getCheckpointViaApi = async (): Promise<void> => {
  try {
    const dms = new DatabaseMigrationService();
    const response1 = await dms.describeTableStatistics({
      
    } as DescribeTableStatisticsCommandInput);

    const response = await dms.describeReplicationTableStatistics({
      ReplicationConfigArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:XGHFY3MXBBAA7KRH4U4QYZDCGI'
    } as DescribeReplicationTableStatisticsCommandInput);
    
    console.log('describeReplicationTableStatistics response:', JSON.stringify(response, null, 2));
  } 
  catch (error) {
    console.log('Direct API not available, falling back to other methods');
  }
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationCheckpoint.ts')) {
  (async () => {
    await getCheckpointViaApi();
    console.log('Done');
  })();
}



