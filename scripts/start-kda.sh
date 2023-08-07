#!/bin/bash

usageText="Usage: start-kda.sh -r <region>"

[ $# -lt 2 ] && { echo $usageText; exit 1; }
while getopts r: flag
do
    case "${flag}" in
        r) region=${OPTARG};;
    esac
done


aws kinesisanalyticsv2 start-application --application-name data-analytics-multi-tenant-app --region $region
