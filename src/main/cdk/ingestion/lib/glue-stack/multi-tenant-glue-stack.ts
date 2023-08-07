import {Construct} from "constructs";
import {NestedStack, NestedStackProps, aws_glue as glue} from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

export interface MultiTenantGlueStackProps extends NestedStackProps {
    s3BucketName: string;
}

export class MultiTenantGlueStack extends NestedStack {

    glueDbName: string;
    constructor(scope: Construct, id: string, props?: MultiTenantGlueStackProps) {
        super(scope, id, props);

        const glueS3Policy = new iam.PolicyStatement({
            actions: ['s3:GetObject', 's3:PutObject'],
            resources: ['arn:aws:s3:::' + props?.s3BucketName! + "*"],
        });

        const glueRole = new iam.Role(this, 'glueRole', {
            assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')],
            roleName: "AWSGlueServiceRole-multi-tenant-ingestion"
        });

        glueRole.attachInlinePolicy(
            new iam.Policy(this, 'list-buckets-policy', {
                statements: [glueS3Policy],
            }),
        );

        const crawler = new glue.CfnCrawler(this, 'multi-tenant-crawler', {
            role: glueRole.roleArn,
            targets: {
                s3Targets: [{
                    path: `s3://${props?.s3BucketName}/`
                }]
            },
            databaseName: 'multi-tenant-db',
            name: 'multi-tenant-crawler',
            schedule: {
                "scheduleExpression": "cron(0/5 * * * ? *)"
            }
        })

        this.glueDbName = crawler.databaseName!;
    }
}