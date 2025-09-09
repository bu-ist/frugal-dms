import { PostExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { log } from "./Utils";

export type StopReplicationHandlerInput = {
  ReplicationConfigArn: string;
  LastCdcStartPosition: string;
  LastCdcStopPosition: string;
  LastReplicationDurationMinutes: number;
  replicationScheduleRateHours: number;
  wasSmokeTest?: boolean;
};

/**
 * This handler will delete a serverless replication that was started and ran up to its configured stop time.
 * This replication is not being resumed later because the time between then and now incurs costs due to the
 * fact that the replication, though stopped, remains provisioned. Thus it is deleted here - later it will 
 * be recreated. 
 * @param event 
 */
export const handler = async (event:ScheduledLambdaInput):Promise<any> => {
  const { groupName, scheduleName, lambdaInput } = event;
  const { 
    ReplicationConfigArn, LastCdcStartPosition, LastCdcStopPosition, 
    LastReplicationDurationMinutes, wasSmokeTest=false
  } = lambdaInput as StopReplicationHandlerInput;

  try {
      log(event, 'Processing with the following event');
  }
  catch(e:any) {    
    log(e);
  }
  finally {
    // Delete the schedule that triggered this execution.
    await PostExecution().cleanup(scheduleName, groupName);    
  }
};    