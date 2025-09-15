# Ad-hoc Commands

As part of the normal operation of this app, DMS resources are created and actions triggered over the course of the overall the repeating scheduled cycle that is set up.
Below are a few administrative commands you can run to start or end that cycle, or create some of those resources on an ad-hoc basis to test and tweak in the AWS management console.

- ### Start a full load

  Run the command below for a full load migration that will automatically change to CDC mode once completed.
  The CDC mode is scheduled to be stopped automatically soon after at a time that reflects the configured duration the full load is expected to take *(`durationForFullLoadMinutes` in the `./context/context.json` file)*.

  ```
  npm run full-load
  ```

   However you can override this duration with a numeric argument representing minutes, for example, 5 hours:

  ```
  npm run full-load 300
  ```

  You also have the option to run just a full load with no CDC to follow:

  ```
  npm run full-load full-load
  ```

  **Testing:** As part of the app configuration, the `./context/context.json` file can contain a `sourceDbTestTables` entry that will indicate the replication configuration should include a filter for source tables that reflect the single *(or few)* test tables for quick replication of a small amount of data. You would typically start a migration this way if you were testing or debugging and were only interested in the scheduling itself, or you wanted a quick way to see if CDC operation was successfully capturing data changes.
  To indicate you want to start a reduced migration like this, include a `"smoketest"` parameter to the command:

  ```
  npm run full-load 60 smoketest
  ```

   *NOTE: Parameter order or case does not matter.*
    

- ### Stop replication

  Run the command below to interrupt and terminate the repeating CDC schedule for replication

  ```
  npm run cancel-migration
  ```

    

- ### Create serverless resources

  To create a serverless replication configuration on which to base serverless migrations for testing purposes, use the following command:

  ```
  npm run create-serverless 
  ```

  The "smoketest" parameter can also be used here:

  ```
  npm run create-serverless smoketest
  ```

  And the restriction against including CDC:

  ```
  npm run create-serverless full-load
  ```

  Or both:

  ```
  npm run create-serverless full-load smoketest
  ```

  

- ### Create provisioned resources

  [Serverless DMS replication](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Serverless.html) has certain [limitations](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Serverless.Limitations.html), among which is a lack of logging detail when it comes to the errors that the specific host database engine may report. However, logging output associated provisioned DMS replication, where the replication is being carried out from a [replication instance](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.Creating.html), does not seem to have this issue. To set up a [Task](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.html) and a [replication instance](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.Creating.html) to run it on, use the following command *(don't forget to cleanup and delete both when finished)*

  ```
  npm run create-provisioned 
  ```

  The `"smoketest"` and `"full-load"` parameters can also be used here.

