# Configuration

Apart from database passwords, all configuration for the stack is defined in `./context/context.json`.

The purpose of many properties will be evident in the name. Some require explanation as follows:

- **stack.Tags:** All resources created will automatically be tagged with the 3 tags set here.

- **replicationScheduleCronExpression:** In an effort to reduce costs, CDC will not be left running, but will only be re-engaged at a set interval and stop after a specific period of time. This is performed by a lambda function triggered by an EventBridge schedule configured with expression.

  ```
  *    *    *    *    *    *
  ┬    ┬    ┬    ┬    ┬    ┬
  │    │    │    │    │    │
  │    │    │    │    │    └─ day of week (0-7, 1L-7L) (0 or 7 is Sun)
  │    │    │    │    └────── month (1-12, JAN-DEC)
  │    │    │    └─────────── day of month (1-31, L)
  │    │    └──────────────── hour (0-23)
  │    └───────────────────── minute (0-59)
  └────────────────────────── second (0-59, optional)
  ```

  See more at: [cron-parser](https://www.npmjs.com/package/cron-parser)

- **replicationScheduleCronTimezone:** This indicates the time zone the `replicationScheduleCronExpression` is based on. See [IANA listing](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for possible values. Defaults to `"America/New_York"`

- **durationForFullLoadMinutes:** This indicates the total duration of time *(minutes)* a full-load migration is expected to take, including provisioning of resources and the data transfer up until the point the migration switches into CDC mode.

- **durationForCdcMinutes:** This indicates the total duration of time *(minutes)* a CDC operation is expected to take, including provisioning of resources, and the data transfer of "the delta" from the source database to bring the target up to date. The automatic stopping point of the CDC process will be based on this value. 

- **sourceDbEngineName:** This identifies what kind of database data is being migrated from. Currently this only includes `"oracle"`, for which directions on how to prepare for migration exists [here](./docs/oracle.md) but `"mysql"` and `"postgres"` are likely candidates as well and have placeholders for directions [here](./docs/mysql.md) and [here](./docs/postgres.md) respectively.

- **sourceDbSubnetIds:** The IDs of subnets that the source database operates in.

- **sourceDbLargestLobKB:** This is the size of the largest LOB field you expect to find in the data you expect to migrate from the source database.
  Related documentation is [here](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Tasks.LOBSupport.html).

- **sourceDbSchemas:** A list of schemas that you intend to migrate from your source database.

- **sourceDbTestTables:** A list of tables, mapped by schema that migration will be restricted to for quick replication of a small amount of data. You would typically start a migration this way if you were testing or debugging and were only interested in the scheduling itself, or you wanted a quick way to see if CDC operation was successfully capturing data changes. *TODO: Only the first schema is read - need to adjust for multiple*.

- **postgresInstanceSize:** It is assumed that you are testing and want to create a Postgres RDS target database in the same subnet as the source database to simplify connectivity and network access. This setting is optional, but if set, will trigger the creation of a small RDS instance for Postgres. Cannot be set if **postgresHost** has a value - these two settings are mutually exclusive.

- **postgresInstanceIngress:** Comes into play if **postgresInstanceSize** is set. The items in this listing are used to configure the ingress rules for the target Postgres database.

- **postgresPassword:** The password for the target Postgres database. Can only be used if the Postgres database is NOT hosted by the RDS service *(ie: resides on the company network)*. Nonetheless, use of this property is discouraged in favor of secrets manager, and is only intended if your Postgres database does not contain sensitive information and is being hosted on  a dev box, or your machine *(localhost)*.

- 

**Example config:**

```
{
  "stack": {
    "Id": "kuali-dms",
    "Account": "770203350335",
    "Region": "us-east-1",
    "Tags": {
      "Service": "research-administration",
      "Function": "kuali",
      "Landscape": "stg"
    }
  },
  "scheduledRunRetryOnFailure": true,
  "replicationScheduleCronExpression": "0 2 * * *",
  "replicationScheduleCronTimezone": "America/New_York",
  "durationForFullLoadMinutes": 300,
  "durationForCdcMinutes": 60,

  "sourceDbEngineName": "oracle",
  "sourceDbHost": "stg.db.kualitest.research.bu.edu",
  "sourceDbPort": 1521,
  "sourceDbUser": "DMS_USER",
  "sourceDbPassword": "",
  "sourceDbSecretName": "kuali/stg/kuali-oracle-rds-app-password",
  "sourceDbSecurityGroupId": "sg-0b8b04f9cf045f812",
  "sourceDbVpcId": "vpc-0290de1785982a52f",
  "sourceDbLargestLobKB": 7000,
  "sourceDbSubnetIds": [
    "subnet-0d4acd358fba71d20",
    "subnet-08afdf870ee85d511"
  ],
  "sourceDbSchemas": [
    "KCOEUS"
  ],
  "sourceDbTestTables": [
    { "schemaName": "KCOEUS", "tableNames": [ "DMS_SMOKE_TEST2" ] }
  ],

  "postgresHost": "ist-pg-dl-dev01.bu.edu",
  "postgresPort": 5432,
  "postgresDbName": "kuali_db",
  "postgresSchema": "kuali_raw2",
  "postgresUser": "kl_user",
  "postgresPassword": "",
  "postgresSecretName": "kuali/stg/kuali-postgres-credentials",
  "postgresInstanceIngress": [
    { "cidr": "168.122.78.128/28", "description": "vpn.bu.edu/dbreport Off Campus 1" },
    { "cidr": "168.122.68.64/26", "description": "vpn.bu.edu/dbreport Off Campus 2" },
    { "cidr": "168.122.84.240/28", "description": "vpn.bu.edu/dbreport On Campus" },
    { "cidr": "168.122.81.0/24", "description": "CampusVpnCidr one" },
    { "cidr": "168.122.82.0/23", "description": "CampusVpnCidr two" },
    { "cidr": "168.122.76.0/24", "description": "CampusVpnCidr three" },
    { "cidr": "168.122.68.0/24", "description": "CampusVpnCidr four" },
    { "cidr": "168.122.69.0/24", "description": "CampusVpnCidr five" },
    { "cidr": "10.1.0.0/21", "description": "CampusVpnCidr six" }
  ]
}
```

