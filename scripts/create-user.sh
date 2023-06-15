#!/bin/bash
usageText="Usage: create-user.sh -c <user-pool-id> -u <email address> -p <password> -r <region i.e. us-west-2> -t <tenantId>"

[ $# -lt 10 ] && { echo $usageText; exit 1; }
while getopts c:u:p:r:t: flag
do
    case "${flag}" in
        c) poolId=${OPTARG};;
        u) user=${OPTARG};;
	p) password=${OPTARG};;
	r) region=${OPTARG};;
	t) tenantId=${OPTARG};;
    esac
done

aws cognito-idp admin-create-user --user-pool-id $poolId --username $user --user-attribute Name=email,Value=$user Name=custom:tenantId,Value=$tenantId Name=custom:tier,Value=Basic --region=$region

aws cognito-idp admin-set-user-password --user-pool-id $poolId --username $user --password $password --permanent --region $region 
