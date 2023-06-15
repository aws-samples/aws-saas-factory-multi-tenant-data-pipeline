import {NestedStack, NestedStackProps, aws_athena, Aws} from "aws-cdk-lib";
import {Construct} from "constructs";
import {MultiTenantGlueStackProps} from "../glue-stack/multi-tenant-glue-stack";

export interface AthenaSavedQueryStackProps extends NestedStackProps {
    glueDbName: string;
}

export class AthenaNamedQueryStack extends NestedStack {
    constructor(scope: Construct, id: string, props?: AthenaSavedQueryStackProps) {
        super(scope, id, props);

        new aws_athena.CfnNamedQuery(this, 'query-multi-tenant-by-tenant', {
            database: props?.glueDbName!,
            description: 'Named query for querying by tenant',
            queryString: `SELECT * FROM \"AwsDataCatalog\".\"${props?.glueDbName}\".\"TABLENAME\" where tenant=\'TENANTID\'`,
            workGroup: 'primary',
            name: 'Query-By-Tenant'
        })
    }
}