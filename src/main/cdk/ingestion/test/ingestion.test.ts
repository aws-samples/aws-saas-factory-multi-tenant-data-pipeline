import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MultiTenantCognitoStack } from '../lib/cognito-stack/multi-tenant-cognito-stack';

// These tests guard the tenant-isolation boundary. In this solution the caller's
// custom:tenantId claim becomes the Kinesis partition key and then the S3 "tenant="
// prefix, so anything that lets a user choose that value lets them choose whose
// partition their records land in.
//
// The reported defect was that the app client set no WriteAttributes. Omitting it is the
// permissive option, so custom:tenantId was writable by the user themselves via Cognito's
// standard UpdateUserAttributes API -- and, with self-signup on, settable at SignUp.

function cognitoTemplate(): Template {
  const app = new cdk.App();
  const parent = new cdk.Stack(app, 'TestParent');
  const stack = new MultiTenantCognitoStack(parent, 'TestCognito');
  return Template.fromStack(stack);
}

describe('Cognito tenant-isolation configuration', () => {
  test('app client restricts WriteAttributes and excludes the tenant attributes', () => {
    const template = cognitoTemplate();
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const ids = Object.keys(clients);

    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const write = clients[id].Properties.WriteAttributes;

      // Present at all: absent means the permissive default.
      expect(write).toBeDefined();

      // The two attributes the authorization model depends on must not be
      // end-user writable.
      expect(write).not.toContain('custom:tenantId');
      expect(write).not.toContain('custom:tier');

      // No custom attribute should be user-writable here.
      for (const attr of write as string[]) {
        expect(attr.startsWith('custom:')).toBe(false);
      }
    }
  });

  test('ReadAttributes is not restricted, so custom:tenantId still reaches the ID token', () => {
    // Read permissions decide which attributes appear as ID token claims. If a
    // ReadAttributes list were added that omitted custom:tenantId, the claim would
    // disappear from the token and the authorizer would fail closed on every request.
    // This asserts the fix did not over-tighten into an outage.
    const template = cognitoTemplate();
    const clients = template.findResources('AWS::Cognito::UserPoolClient');

    for (const id of Object.keys(clients)) {
      const read = clients[id].Properties.ReadAttributes;
      if (read !== undefined) {
        expect(read).toContain('custom:tenantId');
      }
    }
  });

  test('self-signup is disabled, so registration cannot mint a tenant identity', () => {
    // Tenant assignment is administrative: scripts/create-user.sh calls
    // admin-create-user. selfSignUpEnabled: false renders as
    // AllowAdminCreateUserOnly: true.
    const template = cognitoTemplate();
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: Match.objectLike({
        AllowAdminCreateUserOnly: true,
      }),
    });
  });

  test('tenant attributes stay mutable so an operator can still reassign a tenant', () => {
    // WriteAttributes constrains the end user, not the IAM-authorized admin APIs.
    // Making the schema immutable instead would break admin-update-user-attributes,
    // which is the supported way to move a user between tenants.
    const template = cognitoTemplate();
    const pools = template.findResources('AWS::Cognito::UserPool');

    for (const id of Object.keys(pools)) {
      const schema = pools[id].Properties.Schema as Array<Record<string, unknown>>;
      const tenant = schema.find((s) => s.Name === 'tenantId');
      expect(tenant).toBeDefined();
      expect(tenant!.Mutable).toBe(true);
    }
  });
});
