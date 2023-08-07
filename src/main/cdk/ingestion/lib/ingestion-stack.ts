import {CfnOutput, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import { MultiTenantCognitoStack } from './cognito-stack/multi-tenant-cognito-stack';
import {MultiTenantKinesisStack} from "./kinesis-stack/kinesis-stack";
import {MultiTenantApigatewayStack} from "./apigateway-stack/multi-tenant-apigateway-stack"
import {MultiTenantGlueStack} from "./glue-stack/multi-tenant-glue-stack";
import {AthenaNamedQueryStack} from "./athena-stack/athena-saved-query-stack";

export class IngestionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cognitoStack = new MultiTenantCognitoStack(this, 'MultiTenantCognitoStack', {});
    const kinesisStack = new MultiTenantKinesisStack(this, 'MultiTenantKinesisStack', {});
    const apiGatewayStack = new MultiTenantApigatewayStack(this, 'MultiTenantApigatewayStack', {
      userPoolId: cognitoStack.userPoolId,
      kinesisDataStreamName: kinesisStack.kinesisDataStreamName,
      kdaRole: kinesisStack.kdaRole,
    })
    const glueStack = new MultiTenantGlueStack(this, 'MultiTenantGlueStack', {
      s3BucketName: kinesisStack.s3Bucket,
    })
    const athenaStack = new AthenaNamedQueryStack(this, 'AthenaNamedQueryStack', {
      glueDbName: glueStack.glueDbName,
    })

    new CfnOutput(this, 'UserPoolId', {value: cognitoStack.userPoolId});
    new CfnOutput(this, 'AppClientId', {value: cognitoStack.appClientId});
    new CfnOutput(this, 'S3Bucket', {value: kinesisStack.s3Bucket});
    new CfnOutput(this, 'ApigatewayUrl', {value: apiGatewayStack.apiGatewayUrl});
  }
}
