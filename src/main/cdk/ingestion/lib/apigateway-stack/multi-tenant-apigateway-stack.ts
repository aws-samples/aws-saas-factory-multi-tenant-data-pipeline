import {Aws, Duration, NestedStack, NestedStackProps, RemovalPolicy, Stack} from "aws-cdk-lib";
import {Construct} from "constructs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from "path";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import {AwsIntegration, Cors, MethodLoggingLevel, PassthroughBehavior} from 'aws-cdk-lib/aws-apigateway'
import * as logs from 'aws-cdk-lib/aws-logs';

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
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
            removalPolicy: RemovalPolicy.DESTROY
        });

        const lambdaFunction = new lambda.Function(this, 'jwtauthorizer-lambda-function', {
            runtime: lambda.Runtime.PYTHON_3_9,
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

        const lambdaLogArn = `arn:${Aws.PARTITION}:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:/aws/lambda/${lambdaFunction.functionName}`
        const lambdaPolicy = new iam.PolicyStatement({
            actions: ['logs:CreateLogGroup','logs:CreateLogStream','logs:PutLogEvents'],
            resources: [lambdaLogArn],
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

        const apiAccessLogGroup = new logs.LogGroup(this, 'AccessLogs', {
            retention: 14, // Keep logs for 90 days
        });
        const restApi = new apigateway.RestApi(this, 'Multi-tenant-kinesis-RestAPI', {
            restApiName: 'Multi-tenant-kinesis-RestAPI',
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
                accessLogDestination: new apigateway.LogGroupLogDestination(apiAccessLogGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
                loggingLevel: MethodLoggingLevel.INFO,
            },
        });

        this.apiGatewayUrl = `https://${restApi.restApiId}.execute-api.${this.region}.amazonaws.com/prod/data`;

        const data = restApi.root.addResource('data');

        const requestValidationModel = restApi.addModel('InputValidationModel', {
            contentType: 'application/json',
            modelName: 'InputValidationModel',
            schema: {
                schema: apigateway.JsonSchemaVersion.DRAFT7,
                title: 'InputValidation',
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    Data: {
                        type: apigateway.JsonSchemaType.OBJECT,
                        properties: {
                            device: {type: apigateway.JsonSchemaType.STRING},
                            event: {type: apigateway.JsonSchemaType.STRING},
                            region: {type: apigateway.JsonSchemaType.STRING}
                        },
                        required: ["device", "event", "region"]
                    },
                },
                required: ["Data"],
            }
        });

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
            requestModels: {
                'application/json': requestValidationModel,
            },
            requestValidatorOptions: {
                validateRequestBody: true,
                validateRequestParameters: true,
            },
            methodResponses: [
                { statusCode: '200'},
            ],
        })
    }
}