# Kuali DMS to Postgres

This is a CDK project to build DMS serverless resources for scheduled replication from the source oracle RDS instance to the target Postgres database.

When the CDK project is deployed (cloudformed), the overall replication process involves an initial full data load, followed by a separate brief CDC (change data capture) process. The CDC process is scheduled to run on a schedule, every 24 hours for example, "picking up" where the last scheduled CDC run "left off" to perform "catch up" replication.

The idea behind running serverless CDC on a schedule is to provide a cost-effective alternative to starting a serverless CDC process and leaving it running indefinitely. Since serverless DMS imposes a cost for running CDC continuously, it is little better than running the traditional non-serverless provisioned alternative - neither scenario allows for any "downtime" where no "idling" costs are being incurred.

## Steps

1. [Create a service linked role](https://docs.aws.amazon.com/dms/latest/userguide/slr-services-sl.html#create-slr-sl) for the DMS service if it does not already exist:

   ```
   aws iam create-service-linked-role --aws-service-name dms.amazonaws.com
   {
       "Role": {
           "Path": "/aws-service-role/dms.amazonaws.com/",
           "RoleName": "AWSServiceRoleForDMSServerless",
           "RoleId": "AROA3GU5SOU76QDWUV7VQ",
           "Arn": "arn:aws:iam::770203350335:role/aws-service-role/dms.amazonaws.com/AWSServiceRoleForDMSServerless",
           "CreateDate": "2025-07-21T19:55:35+00:00",
           "AssumeRolePolicyDocument": {
               "Version": "2012-10-17",
               "Statement": [
                   {
                       "Action": [
                           "sts:AssumeRole"
                       ],
                       "Effect": "Allow",
                       "Principal": {
                           "Service": [
                               "dms.amazonaws.com"
                           ]
                       }
                   }
               ]
           }
       }
   }
   ```

2. **Create a "DMS_USER"** in the source oracle database with privileges and configurations needed when using an AWS-managed Oracle database with AWS DMS. Related AWS documentation is [here](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.Oracle.html#CHAP_Source.Oracle.Amazon-Managed.Privileges).

   ```
   CREATE USER DMS_USER
       IDENTIFIED BY "user_password"
       DEFAULT TABLESPACE KUALI_DATA
       TEMPORARY TABLESPACE TEMP
       PROFILE DEFAULT;
   
   GRANT CREATE SESSION TO DMS_USER;
   GRANT SELECT ANY TRANSACTION TO DMS_USER;
   GRANT SELECT on DBA_TABLESPACES TO DMS_USER;
   GRANT ALTER ANY TABLE TO DMS_USER;
   GRANT SELECT ANY TABLE TO DMS_USER;
   GRANT EXECUTE on rdsadmin.rdsadmin_util TO DMS_USER;
   GRANT LOGMINING TO DMS_USER;
   GRANT SELECT_CATALOG_ROLE TO DMS_USER;
   GRANT SELECT ANY DICTIONARY TO DMS_USER;
   GRANT UNLIMITED TABLESPACE TO DMS_USER;
   
   exec rdsadmin.rdsadmin_util.alter_supplemental_logging('ADD');
   exec rdsadmin.rdsadmin_util.alter_supplemental_logging('ADD','PRIMARY KEY');
   
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_VIEWS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_TAB_PARTITIONS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_INDEXES', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_OBJECTS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_TABLES', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_USERS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_CATALOG', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_CONSTRAINTS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_CONS_COLUMNS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_TAB_COLS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_IND_COLUMNS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_LOG_GROUPS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$ARCHIVED_LOG', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOG', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOGFILE', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$DATABASE', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$THREAD', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$PARAMETER', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$NLS_PARAMETERS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$TIMEZONE_NAMES', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$TRANSACTION', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$CONTAINERS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBA_REGISTRY', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('OBJ$', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_ENCRYPTED_COLUMNS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOGMNR_LOGS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOGMNR_CONTENTS','DMS_USER','SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBMS_LOGMNR', 'DMS_USER', 'EXECUTE');
   
   -- (as of Oracle versions 12.1 and higher)
   exec rdsadmin.rdsadmin_util.grant_sys_object('REGISTRY$SQLPATCH', 'DMS_USER', 'SELECT');
   
   -- (for Amazon RDS Active Dataguard Standby (ADG))
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$STANDBY_LOG', 'DMS_USER', 'SELECT'); 
   
   -- (for transparent data encryption (TDE))
   
   exec rdsadmin.rdsadmin_util.grant_sys_object('ENC$', 'DMS_USER', 'SELECT'); 
                  
   -- (for validation with LOB columns)
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBMS_CRYPTO', 'DMS_USER', 'EXECUTE');
                       
   -- (for binary reader)
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBA_DIRECTORIES','DMS_USER','SELECT'); 
                       
   -- Required when the source database is Oracle Data guard, and Oracle Standby is used in the latest release of DMS version 3.4.6, version 3.4.7, and higher.
   
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$DATAGUARD_STATS', 'DMS_USER', 'SELECT');
   ```
   
3. **Create a "AWSDMS_DBLINK" database link**

   ```
   CREATE PUBLIC DATABASE LINK AWSDMS_DBLINK 
      CONNECT TO DMS_USER IDENTIFIED BY "x3BMiRKy.TYBNP3T"
      USING '(DESCRIPTION=
               (ADDRESS=(PROTOCOL=TCP)(HOST=kuali-oracle-stg.clb9d4mkglfd.us-east-1.rds.amazonaws.com)(PORT=1521))
               (CONNECT_DATA=(SERVICE_NAME=KUALI))
             )';
   ```

   Test connectivity with:

   ```
   select 1 from dual@AWSDMS_DBLINK
   ```

4. **Determine the largest LOB field value** expected from the source database
   The DMS replication will be configured to set LOB size limit to a value you specify in Kilobytes.
   Setting a correct value means getting an idea of what the largest LOB field in the source database currently is.
   A script for determining this for an oracle schema is as follows:

   ```
   WITH lob_columns AS (
       SELECT 
           tc.table_name,
           tc.column_name,
           tc.data_type,
           get_max_lob_size(tc.table_name, tc.column_name) as max_size
       FROM user_tab_columns tc
       WHERE tc.data_type LIKE '%LOB%' OR tc.data_type = 'BFILE'
   )
   SELECT 
       table_name,
       column_name,
       data_type,
       max_size
   FROM lob_columns
   ORDER BY 
       CASE WHEN max_size IS NULL THEN 1 ELSE 0 END,
       max_size DESC NULLS LAST,
       table_name,
       column_name;
   ```

   Take the highest value in the result set (will be at the top), add about 10% extra buffer room, and convert to Kilobytes.
   This will be the value you set on the `"oracleLargestLobKB"` property of the `context/context.json` file.
   If you set this value correctly, there should be no truncation of LOB fields at the target database.

5. **Set the redo log retention** appropriately:
   The redo log retention for the source oracle database must be sufficient so that the logs go back as far as will accommodate the `"scheduleRateHours"` value that you set for the scheduled CDC "catchup" runs.
   For example, if you set scheduleRateHours to 24 hours, then the redo log entries must last for at least 24 hours, and it is probably wise to set some buffer room.

   - **[Increase storage](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.ModifyingExisting.html):** Increasing the redo log retention will almost certainly result in an increase in database storage requirements. To accommodate this increase if current storage is not enough, either increase the "Storage" in GB of the "Primary Storage" column of the "Configuration" view of the RDS dashboard for the instance, and/or turn on **[Storage Autoscaling](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.Autoscaling.html)**. If you are not going to se storage autoscaling, the following will give you a clue as to how much storage you may need by displaying how much was output in the last 48 hours:

      ```
      # Set "X" to 48
      SELECT SUM(BLOCKS * BLOCK_SIZE) bytes 
      FROM V$ARCHIVED_LOG
      WHERE FIRST_TIME >= SYSDATE-(X/24) AND DEST_ID=1;
      ```

   - **[Set archive log retention](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.Oracle.CommonDBATasks.RetainRedoLogs.html):** Use the following for an Oracle RDS instance to set the log retention to 48 hours:

      ```
      begin
          rdsadmin.rdsadmin_util.set_configuration(
              name  => 'archivelog retention hours',
              value => '48');
      end;
      /
      commit;
      ```

6. **Create the target schema and/or user** in the target database if they do not already exist;

   ```
   -- Create the schema
   CREATE SCHEMA IF NOT EXISTS KCOEUS;
   
   -- Create the user if it does not already exist
   CREATE USER kl_user WITH LOGIN PASSWORD 'your_secure_password';
   
   -- Grant permissions to kl_user
   GRANT USAGE ON SCHEMA KCOEUS TO kl_user;
   GRANT CREATE ON SCHEMA KCOEUS TO kl_user;
   GRANT ALL PRIVILEGES ON SCHEMA KCOEUS TO kl_user;
   
   -- Set default privileges for future tables
   ALTER DEFAULT PRIVILEGES IN SCHEMA KCOEUS GRANT ALL ON TABLES TO kl_user;
   
   ```

7. **Configure**
   Update `context/context.json`

   
