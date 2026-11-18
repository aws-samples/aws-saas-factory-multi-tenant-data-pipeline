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
            // Tenant assignment is an administrative action in this solution. The only
            // documented way to create a user is scripts/create-user.sh (README step 9),
            // which calls admin-create-user with custom:tenantId. Self-signup was enabled
            // but is not part of that walkthrough, and it is what allowed a party with no
            // relationship to any tenant to obtain an account in the first place.
            //
            // If you enable self-signup when adapting this, you must also supply a
            // server-side tenant assignment -- a pre-signup or post-confirmation Lambda
            // trigger that sets custom:tenantId from something the caller cannot choose.
            // Leaving registration open while the tenant identifier decides the data
            // partition means the caller picks their own partition.
            selfSignUpEnabled: false,

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

            // Restrict what the END USER may write to their own profile.
            //
            // Omitting writeAttributes is the PERMISSIVE option, not the restrictive one:
            // a client created without it may write every mutable attribute, custom ones
            // included. (The Cognito API reference states the opposite for custom
            // attributes; it is wrong, and this has been raised with the documentation
            // owners.) That left custom:tenantId writable by the user themselves through
            // Cognito's own standard UpdateUserAttributes API, using nothing but their own
            // access token. Cognito then signs the changed value, so the Lambda authorizer's
            // signature check passes, and the forged claim becomes the Kinesis partition key
            // and then the S3 "tenant=" prefix -- one tenant writing into another's
            // partition. With self-signup also enabled, the same attribute could be set
            // during SignUp, so no existing tenant account was needed either.
            //
            // Standard attributes only. custom:tenantId and custom:tier are deliberately
            // absent, which leaves them writable only through the IAM-authorized admin APIs
            // that scripts/create-user.sh uses: WriteAttributes does not constrain
            // admin-create-user or admin-update-user-attributes. That is also why the schema
            // above keeps both attributes mutable -- an operator must still be able to
            // reassign a tenant.
            writeAttributes: new cognito.ClientAttributes().withStandardAttributes({
                email: true,
            }),

            // readAttributes is deliberately NOT set. Read permissions govern which
            // attributes appear as claims in the ID token, and the authorizer needs
            // custom:tenantId to be present there. Adding a readAttributes list that omits
            // it would remove the claim from the token and break authorization entirely, so
            // do not "tidy up" by mirroring the write list here.
        });

        this.appClientId = pooledTenantAppClient.userPoolClientId;
    }
}