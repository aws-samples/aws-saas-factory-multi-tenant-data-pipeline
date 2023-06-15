#!/bin/bash

usageText="Usage: start-kda.sh -r <region> -a <application name>"

[ $# -lt 4 ] && { echo $usageText; exit 1; }
while getopts a:r: flag
do
    case "${flag}" in
        r) region=${OPTARG};;
	a) app=${OPTARG};;
    esac
done


aws kinesisanalyticsv2 start-application --application-name $app --region $region
