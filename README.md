The project will provision an API Gateway, custom authorizer, Kinesis Data Stream, Kinesis Data Analytics, Kinesis Firehose, and S3 bucket for data lake.<br />

## Steps to deploy:
Note: These steps has been tested in AWS Cloud9 environment.  You can also run the deployment as long as you have all the dependencies installed.
###Flink Application
We have a flink application written in java as part of this deployment.  In order for us to deploy the stack, we need to first compile the flink application and create a jar file for deployement.

1) Please install Maven to build the jar file.  You can download Maven [here](https://maven.apache.org/download.cgi). Only the binaries are required, so look for the link to apache-maven-{version}-bin.zip or apache-maven-{version}-bin.tar.gz.

2) Once you have downloaded the zip file, unzip it to your computer. Then add the bin folder to your path.

3) cd <project_path> - run the command "mvn package".  This should start the build process.  If everything complete successfully, you should see "BUILD SUCCESS" message once the build process completes.

4) This should create the file <project_path>/target/aws-kinesis-analytics-java-apps-1.0.jar.
###CDK Stack
1) cd <project_path>/src/main/cdk/ingestion - run the command "npm install"

2) execute "cdk deploy" to provision the stack

3) Please take note of the output from the cdk stack.  We will need the output value in later steps.

4) Now that we have all resources provisioned, we'll need to start out Kinesis Data Analytics application.<br />
  cd &lt;project_path&gt;/scripts <br />
  execute command: <br />
  chmod +x ./start-kda.sh <br />
  "./start-kda.sh -r &lt;region i.e. us-west-2&gt; -a <application name.  This is the value from the cdk output 'IngestionStack.KinesisAnalyticsApplicationName>'" <br />
  Note: script will not provide any output.  You can verify if the application started by going to Kinesis Data Analytics page in the console. Status field should show the application is "Running"<br />

5) Let's create a user <br />
  cd <project_path>/scripts <br />
  execute command: <br />
  chmod +x ./create-user.sh <br />
  "./create-user.sh -c <user-pool-id  This is from the cdk output 'IngestionStack.UserPoolId'> -u &lt;email address&gt; -p &lt;password&gt; -r &lt;region i.e. us-west-2&gt; -t <tenantId.  You can make up a tenant Id or name>" <br />

6) Now we have a user, we need the JWT (JSON Web Token) for the user from Amazon Congito. <br />
  cd <project_path>/scripts <br />
  execute command: <br />
  chmod +x ./get-jwt.sh <br />
  "./get-jwt.sh -c <app client id.  This is from the cdk output 'IngestionStack.AppClientId'> -u &lt;email address&gt; -p &lt;password&gt; -r &lt;region i.e. us-west-2&gt;" <br />
  you will want the 'IdToken' section of the JWT to submit requests. <br />

7) You can send a test message with [Postman](https://www.postman.com/). <br />
  For the request endpoint, you will enter the endpoint for the API Gateway we just provisioned.  You can get this from the cdk output 'IngestionStack.ApigatewayUrl' <br />
  You will want to click on the "Authorization tab, choose \"Bearer Token\" for type and copy the value from the IdToken of the JWT into the token field. <br />
  Click on the Body tab and make sure there is a Data node in the json message. <br />
   {<br />
     &nbsp;&nbsp;"Data": { <br />
       &nbsp;&nbsp;&nbsp;&nbsp;"key1": "value1", <br />
       &nbsp;&nbsp;&nbsp;&nbsp;"key2": "value2", <br />
       &nbsp;&nbsp;&nbsp;&nbsp;"key3": "value3" <br />
     &nbsp;&nbsp;}<br />
   }

## Querying the data

Now that we have sent a test message, we need to make sure we give Glue crawler an opportunity to run.

The crawler is deployed to run every 5 minutes.  The crawler will need to run first to create a Glue db.
You can go see the status of the crawler job by going to AWS Glue page in the console to view the status.
Once the job finish running, you can click on Databases in the Glue page and you should see a db called "multi-tenant-db"

You will want to click on the database to see the name of the table created by crawler.  You will need the table name to run the Athena query.
As part of this project, we deployed a Saved queries for Athena to show how you can query the data based on the tenantId.

You can find the Saved Query by going to Amazon Athena page in the console and click on the "Saved queries" tab.

Pre-requisite: You will need to [setup Athena](https://docs.aws.amazon.com/athena/latest/ug/querying.html#query-results-specify-location-console) with an output S3 bucket before running the query.

SELECT * FROM "AwsDataCatalog"."multi-tenant-db"."TABLENAME" where tenant='TENANTID'

You will want to replace the values that are ALL CAPS from the saved query.
You need to replace the TABLENAME with the name of the table created by crawler.
You need to replace the TENANTID with the name of the tenant id you used when you created your user.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
