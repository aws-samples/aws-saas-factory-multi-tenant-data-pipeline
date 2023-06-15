import {Duration, NestedStack, NestedStackProps, RemovalPolicy, Stack} from "aws-cdk-lib";
import {Construct} from "constructs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from "path";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import {Cors, AwsIntegration, PassthroughBehavior} from "aws-cdk-lib/aws-apigateway";

export interface MultiTenantApigatewayStackProps extends NestedStackProps {
    userPoolId: string;
    kinesisDataStreamName: string;
    kdaRole: iam.Role;
}

export class MultiTenantApigatewayStack extends NestedStack {

    apiGatewayUrl: string;
    constructor(scope: Construct, id: string, props?: MultiTenantApigatewayStackProps) {
        super(scope, id, props);

        const authorizerLayer = new lambda.LayerVersion(this, 'AuthorizerLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda_layer/')),
            description: 'Common Layer for Lambda Authorizer',
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_8],
            removalPolicy: RemovalPolicy.DESTROY
        });

        const lambdaFunction = new lambda.Function(this, 'jwtauthorizer-lambda-function', {
            runtime: lambda.Runtime.PYTHON_3_8,
            memorySize: 256,
            timeout: Duration.seconds(5),
            handler: 'app.lambda_handler',
            layers: [authorizerLayer],
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda_authorizer')),
            environment: {
                REGION: Stack.of(this).region,
                AVAILABILITY_ZONES: JSON.stringify(
                    Stack.of(this).availabilityZones,
                ),
                USERPOOL_ID: props?.userPoolId!,
            },
        });

        const lambdaPolicy = new iam.PolicyStatement({
            actions: ['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],
            resources: ['*'],
        });

        lambdaFunction.role?.attachInlinePolicy(
            new iam.Policy(this, 'list-buckets-policy', {
                statements: [lambdaPolicy],
            }),
        );

        const tokenAuthorizerProps: apigateway.TokenAuthorizerProps = {
            handler: lambdaFunction,
            authorizerName: 'JWTAuthorizer',
            resultsCacheTtl: Duration.minutes(5),
        };

        const authorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer-Pooled', tokenAuthorizerProps);

        const restApi = new apigateway.RestApi(this, 'Multi-tenant-kinesis-RestAPI-CDK', {
            restApiName: 'Multi-tenant-kinesis-RestAPI-CDK',
            defaultMethodOptions: {
                authorizer,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: Cors.ALL_ORIGINS,
            },
            endpointConfiguration: {
                types: [ apigateway.EndpointType.REGIONAL ],
            },
            deployOptions: {
                stageName: 'prod',
            },
        });

        this.apiGatewayUrl = `https://${restApi.restApiId}.execute-api.${this.region}.amazonaws.com/prod/data`;

        const data = restApi.root.addResource('data');
        const putRecordResource = data.addMethod('POST', new AwsIntegration({
            service: 'kinesis',
            action: 'PutRecord',
            integrationHttpMethod: 'POST',
            options: {
                credentialsRole: props?.kdaRole,
                passthroughBehavior: PassthroughBehavior.NEVER,
                integrationResponses: [
                    { statusCode: '200'},
                ],
                requestTemplates: {
                    'application/json': '{"StreamName": "' + props?.kinesisDataStreamName + '"' +
                        ', "Data": "$util.base64Encode($input.json(\'$.Data\'))"' +
                        ', "PartitionKey": "$context.authorizer.tenantId" }',
                },
            },
        }),{
            methodResponses: [
                { statusCode: '200'},
            ],
        })
    }
}