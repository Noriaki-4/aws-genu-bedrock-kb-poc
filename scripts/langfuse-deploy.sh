#!/bin/bash
#
# Deploys Langfuse (AWS Generative AI Solution Box, "deploy-langfuse-on-ecs-with-fargate")
# by creating the LangfuseDeploymentStack CloudFormation stack and waiting for the
# underlying CodeBuild project (ECS Fargate + Aurora + Redis + ALB, ~25-35 min) to finish.
#
# After this script finishes, check the email sent to --email for the Langfuse URL,
# login password, and Public/Secret API keys, then paste them into packages/cdk/cdk.json
# (langfuseHost / langfusePublicKey / langfuseSecretKey) and set langfuseEnabled: true.

set -eu

TEMPLATE_URL="https://aws-ml-jp.s3.ap-northeast-1.amazonaws.com/asset-deployments/LangfuseDeploymentStack.yaml"
STACK_NAME="LangfuseDeploymentStack"

PROFILE=""
REGION="ap-northeast-1"
EMAIL=""
ORG_ID="my-org"
ORG_NAME="My Org"
PROJECT_ID="my-project"
PROJECT_NAME="My Project"
WORKER_DESIRED_COUNT=1
DATABASE_INSTANCE_TYPE="db.t4g.medium"
CACHE_NODE_TYPE="cache.t4g.micro"

usage() {
  echo "Usage: $0 --profile <aws-profile> --email <notification-email> [--region ap-northeast-1]"
  echo "Optional: --org-id --org-name --project-id --project-name --worker-count --db-instance-type --cache-node-type"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --org-id) ORG_ID="$2"; shift 2 ;;
    --org-name) ORG_NAME="$2"; shift 2 ;;
    --project-id) PROJECT_ID="$2"; shift 2 ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    --worker-count) WORKER_DESIRED_COUNT="$2"; shift 2 ;;
    --db-instance-type) DATABASE_INSTANCE_TYPE="$2"; shift 2 ;;
    --cache-node-type) CACHE_NODE_TYPE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [ -z "$PROFILE" ] || [ -z "$EMAIL" ]; then
  usage
fi

if ! command -v aws &> /dev/null; then
  echo "Error: AWS CLI is not installed"
  exit 1
fi

echo "Creating $STACK_NAME in $REGION (profile: $PROFILE)..."
aws cloudformation create-stack \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-url "$TEMPLATE_URL" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=NotificationEmailAddress,ParameterValue="$EMAIL" \
    ParameterKey=ExecuteDelete,ParameterValue=false \
    ParameterKey=LangfuseWorkerDesiredCount,ParameterValue="$WORKER_DESIRED_COUNT" \
    ParameterKey=DatabaseInstanceType,ParameterValue="$DATABASE_INSTANCE_TYPE" \
    ParameterKey=CacheNodeType,ParameterValue="$CACHE_NODE_TYPE" \
    ParameterKey=TelemetryEnabled,ParameterValue=true \
    ParameterKey=ExperimentalFeaturesEnabled,ParameterValue=true \
    ParameterKey=OrganizationId,ParameterValue="$ORG_ID" \
    ParameterKey=OrganizationName,ParameterValue="$ORG_NAME" \
    ParameterKey=ProjectId,ParameterValue="$PROJECT_ID" \
    ParameterKey=ProjectName,ParameterValue="$PROJECT_NAME"

echo "Waiting for $STACK_NAME to reach CREATE_COMPLETE (this only covers the wrapper stack, not the actual Langfuse deployment)..."
aws cloudformation wait stack-create-complete \
  --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME"

PROJECT=$(aws cloudformation describe-stacks \
  --profile "$PROFILE" --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='CodeBuildProjectName'].OutputValue" --output text)

echo "Wrapper stack created. Waiting for CodeBuild project '$PROJECT' to finish deploying Langfuse (~25-35 min)..."

BUILD_ID=$(aws codebuild list-builds-for-project \
  --profile "$PROFILE" --region "$REGION" --project-name "$PROJECT" \
  --query "ids[0]" --output text)

while true; do
  STATUS=$(aws codebuild batch-get-builds \
    --profile "$PROFILE" --region "$REGION" --ids "$BUILD_ID" \
    --query "builds[0].buildStatus" --output text)
  echo "  [$(date '+%H:%M:%S')] build status: $STATUS"
  case "$STATUS" in
    SUCCEEDED) break ;;
    FAILED|FAULT|STOPPED|TIMED_OUT)
      echo "Error: Langfuse deployment build ended with status $STATUS"
      echo "Check CodeBuild logs for project '$PROJECT' for details."
      exit 1
      ;;
  esac
  sleep 30
done

echo ""
echo "Langfuse deployment finished successfully."
echo "Check the email sent to $EMAIL for the Langfuse URL, login password, and Public/Secret API keys."
echo "Then update packages/cdk/cdk.json:"
echo '  "langfuseEnabled": true,'
echo '  "langfuseHost": "<url-from-email>",'
echo '  "langfusePublicKey": "<public-key-from-email>",'
echo '  "langfuseSecretKey": "<secret-key-from-email>"'
echo "and run: npm run cdk:deploy -- --profile $PROFILE"
