#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IngestionStack } from '../lib/ingestion-stack';
import { AwsSolutionsChecks } from 'cdk-nag'
import { Aspects } from 'aws-cdk-lib';

//const app = new cdk.App();
// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
//Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))
//new IngestionStack(app, 'IngestionStack', {});


const app = new cdk.App();
new IngestionStack(app, 'IngestionStack', {
});