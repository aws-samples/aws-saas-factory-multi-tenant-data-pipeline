import {Aws, Duration, NestedStack, NestedStackProps, RemovalPolicy} from "aws-cdk-lib";
import {Construct} from "constructs";
import {Bucket, BucketEncryption, ObjectOwnership} from "aws-cdk-lib/aws-s3";
import * as path from "path";
import * as assets from 'aws-cdk-lib/aws-s3-assets'
import * as kms from 'aws-cdk-lib/aws-kms';
import {Key} from 'aws-cdk-lib/aws-kms';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as iam from 'aws-cdk-lib/aws-iam';
import {Effect} from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as kinesisanalyticsv2 from 'aws-cdk-lib/aws-kinesisanalyticsv2';

export interface MultiTenantKinesisStackProps extends NestedStackProps {

}

export class MultiTenantKinesisStack extends NestedStack {

    s3Bucket: string;
    kinesisDataStreamName: string;
    kinesisAnalyticsApplicationName: string;
    kdaRole: iam.Role;

    constructor(scope: Construct, id: string, props?: MultiTenantKinesisStackProps) {
        super(scope, id, props);

        const logBucket = new Bucket(this, 'access-log-bucket',{
            enforceSSL: true,
            versioned: true,
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
            encryption: BucketEncryption.KMS,
            encryptionKey: new Key(this, 'access-log-BucketKey', {
                enableKeyRotation: true,
            })
        })

        const destBucket = new Bucket(this, 'kinesis-dest-bucket', {
            objectOwnership: ObjectOwnership.OBJECT_WRITER,
            encryption: BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            removalPolicy: RemovalPolicy.DESTROY,
            serverAccessLogsPrefix: 'access-logs',
            serverAccessLogsBucket: logBucket,
        });

        this.s3Bucket = destBucket.bucketName;

        const asset = new assets.Asset(this, 'IngestionAsset', {
            path: path.join(__dirname, '../../../../../../target/aws-kinesis-analytics-java-apps-1.0.jar'),
        });


        const kinesisKey = new kms.Key(this, 'KinesisKey', {
            enableKeyRotation: true,
        });

        const kinesisDataStream = new kinesis.Stream(this, 'data-Multi-tenant-kinesis-stream', {
            encryption: kinesis.StreamEncryption.KMS,
            encryptionKey: kinesisKey,
            retentionPeriod: Duration.hours(24),
            streamMode: kinesis.StreamMode.ON_DEMAND,
            streamName: 'data-Multi-tenant-kinesis-stream',
        });

        this.kinesisDataStreamName = kinesisDataStream.streamName;

        const kdaRole = new iam.Role(this, 'KdaRole', {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal('kinesisanalytics.amazonaws.com'),
                new iam.ServicePrincipal('apigateway.amazonaws.com'),
                new iam.ServicePrincipal('firehose.amazonaws.com'),
            )
        });

        this.kdaRole = kdaRole;

        const kdaLogGroup = new logs.LogGroup(this, 'KdaLogGroup', {
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const kdaLogStream = new logs.LogStream(this, 'KdaLogStream', {
            logGroup: kdaLogGroup,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const logStreamArn = `arn:${Aws.PARTITION}:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:${kdaLogGroup.logGroupName}:log-stream:${kdaLogStream.logStreamName}`;

        destBucket.grantReadWrite(kdaRole);
        kinesisDataStream.grantReadWrite(kdaRole)
        asset.grantRead(kdaRole);

        kdaRole.addToPolicy(new iam.PolicyStatement({
            actions: [ 'logs:DescribeLogStreams', 'logs:DescribeLogGroups', 'logs:PutLogEvents', 'cloudwatch:PutMetricData' ],
            resources: [ logStreamArn ]
        }));

        kdaRole.addToPolicy(new iam.PolicyStatement({
            actions:['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards', 'kinesis:DescribeStreamSummary', 'kinesis:RegisterStreamConsumer' ],
            resources: [kinesisDataStream.streamArn]
        }))


        const firehoseLogGroup = new logs.LogGroup(this, 'firehoseLogGroup', {
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const firehoseLogStream = new logs.LogStream(this, 'firehoseLogStream', {
            logGroup: firehoseLogGroup,
            removalPolicy: RemovalPolicy.DESTROY
        });

        const firehoseLogStreamArn = `arn:${Aws.PARTITION}:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:${firehoseLogGroup.logGroupName}:log-stream:${firehoseLogStream.logStreamName}`;

        kdaRole.addToPolicy(new iam.PolicyStatement({
            actions: [ 'logs:PutLogEvents' ],
            resources: [ firehoseLogStreamArn ]
        }));

        const firehoseStream = new firehose.CfnDeliveryStream(this, 'delivery-multi-tenant-firehose-stream', {
            deliveryStreamName: 'delivery-multi-tenant-firehose-stream',
            deliveryStreamEncryptionConfigurationInput: {
                keyType: "AWS_OWNED_CMK",
            },
            extendedS3DestinationConfiguration: {
                cloudWatchLoggingOptions: {
                    enabled: true,
                    logGroupName: firehoseLogGroup.logGroupName,
                    logStreamName: firehoseLogStream.logStreamName,
                },
                bucketArn: destBucket.bucketArn,
                roleArn: kdaRole.roleArn,
                prefix: 'tenant=!{partitionKeyFromQuery:tenantId}/year=!{partitionKeyFromQuery:year}/' +
                    'month=!{partitionKeyFromQuery:month}/day=!{partitionKeyFromQuery:day}/hour=!{partitionKeyFromQuery:hour}/',
                errorOutputPrefix: 'error/!{firehose:error-output-type}/',
                bufferingHints: {
                    intervalInSeconds: 60,
                },
                dynamicPartitioningConfiguration: {
                    enabled: true,
                },
                processingConfiguration: {
                    enabled: true,
                    processors: [{
                        type: 'MetadataExtraction',
                        parameters: [
                            {
                                parameterName: 'MetadataExtractionQuery',
                                parameterValue: '{tenantId: .TenantId, year: .timestamp| strftime("%Y"), month: .timestamp| strftime("%m"), ' +
                                    'day: .timestamp| strftime("%d"), hour: .timestamp| strftime("%H")}',
                            },
                            {
                                parameterName: 'JsonParsingEngine',
                                parameterValue: 'JQ-1.6',
                            },
                        ],
                    }],
                },
            },
        })

        kdaRole.addToPolicy(new iam.PolicyStatement( {
            effect: Effect.ALLOW,
            resources: [firehoseStream.attrArn],
            actions: ['firehose:PutRecord', 'firehose:PutRecordBatch']
        }))

        const kdaApp = new kinesisanalyticsv2.CfnApplication(this, 'data-analytics-multi-tenant-app', {
            runtimeEnvironment: 'FLINK-1_11',
            serviceExecutionRole: kdaRole.roleArn,
            applicationName: 'data-analytics-multi-tenant-app',
            applicationConfiguration: {
                environmentProperties: {
                    propertyGroups: [
                        {
                            propertyGroupId: 'FlinkApplicationProperties',
                            propertyMap: {
                                InputKinesisStream: kinesisDataStream.streamName,
                                FirehoseStreamName: firehoseStream.deliveryStreamName!,
                            },
                        }
                    ]
                },
                flinkApplicationConfiguration: {
                    monitoringConfiguration: {
                        logLevel: 'INFO',
                        metricsLevel: 'TASK',
                        configurationType: 'CUSTOM'
                    },
                    parallelismConfiguration: {
                        autoScalingEnabled: false,
                        parallelism: 2,
                        parallelismPerKpu: 1,
                        configurationType: 'CUSTOM'
                    },
                    checkpointConfiguration: {
                        configurationType: "CUSTOM",
                        checkpointInterval: 60_000,
                        minPauseBetweenCheckpoints: 60_000,
                        checkpointingEnabled: true
                    }
                },
                applicationSnapshotConfiguration: {
                    snapshotsEnabled: false
                },
                applicationCodeConfiguration: {
                    codeContent: {
                        s3ContentLocation: {
                            bucketArn: asset.bucket.bucketArn,
                            fileKey: asset.s3ObjectKey,
                        }
                    },
                    codeContentType: 'ZIPFILE'
                }
            }
        });

        this.kinesisAnalyticsApplicationName = kdaApp.applicationName!;

        const policy = kdaRole.node.findChild('DefaultPolicy') as iam.Policy
        const cfnpolicy = policy.node.defaultChild as iam.CfnPolicy;
        kdaApp.addDependsOn(cfnpolicy);

        new kinesisanalyticsv2.CfnApplicationCloudWatchLoggingOption(this, 'KdsFlinkProducerLogging', {
            applicationName: kdaApp.ref.toString(),
            cloudWatchLoggingOption: {
                logStreamArn: logStreamArn
            }
        });
    }
}