#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IngestionStack } from '../lib/ingestion-stack';

// To run this stack through cdk-nag's AwsSolutions checks, add the cdk-nag package
// at a version whose aws-cdk-lib peer range covers the version pinned in
// package.json, then uncomment the block below -- imports included -- and remove the
// plain instantiation that follows it.
//import { AwsSolutionsChecks } from 'cdk-nag';
//import { Aspects } from 'aws-cdk-lib';
//const app = new cdk.App();
// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
//Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
//new IngestionStack(app, 'IngestionStack', {});


const app = new cdk.App();
new IngestionStack(app, 'IngestionStack', {
});