import {NestedStack, NestedStackProps, RemovalPolicy} from "aws-cdk-lib";
import {Construct} from "constructs";
import * as cognito from 'aws-cdk-lib/aws-cognito'
import {CfnUserPool} from "aws-cdk-lib/aws-cognito";


export interface TenantInfraStackProps extends NestedStackProps {

}

export class MultiTenantCognitoStack extends NestedStack {

    userPoolId: string;
    appClientId: string;

    constructor(scope: Construct, id: string, props?: TenantInfraStackProps) {
        super(scope, id, props);

        const userPool = new cognito.UserPool(this, 'userpool', {
            userPoolName: 'multi-tenant-kinesis-pool',
            selfSignUpEnabled: true,

            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            customAttributes: {
                tenantId: new cognito.StringAttribute({mutable: true}),
                tier: new cognito.StringAttribute({mutable: true}),
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireDigits: true,
                requireUppercase: true,
                requireSymbols: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

            removalPolicy: RemovalPolicy.DESTROY,
        });

        const userPoolCfn = userPool.node.defaultChild as CfnUserPool;
        userPoolCfn.userPoolAddOns = { advancedSecurityMode: "ENFORCED"};

        this.userPoolId = userPool.userPoolId;

        const pooledTenantAppClient = userPool.addClient('PooledUserPoolClient', {
            generateSecret: false,
            authFlows: {
                adminUserPassword: true,
                custom: true,
                userSrp: true,
                userPassword: true,
            },
            oAuth: {
                flows: {
                    implicitCodeGrant: true,
                    authorizationCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.PHONE,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [`https://examples.com`],
            },
            preventUserExistenceErrors: true,
        });

        this.appClientId = pooledTenantAppClient.userPoolClientId;
    }
}