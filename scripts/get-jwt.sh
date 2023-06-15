#!/bin/bash
usageText="Usage: get-jwt.sh -c <cognito app client id> -u <email address> -p <password> -r <region i.e. us-west-2>"

[ $# -lt 8 ] && { echo $usageText; exit 1; }
while getopts c:u:p:r:t: flag
do
    case "${flag}" in
        c) appId=${OPTARG};;
        u) user=${OPTARG};;
	p) password=${OPTARG};;
	r) region=${OPTARG};;
    esac
done

aws cognito-idp initiate-auth --region $region --auth-flow USER_PASSWORD_AUTH --client-id $appId --auth-parameters USERNAME=$user,PASSWORD=$password
