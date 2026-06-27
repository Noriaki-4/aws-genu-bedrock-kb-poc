#!/bin/bash
#
# Tears down Langfuse (AWS Generative AI Solution Box) completely:
#   1. Creates a LangfuseDeletionStack (same template, ExecuteDelete=true) which runs
#      `cdk destroy --force --all` via CodeBuild against the actual Langfuse infra
#      (ECS Fargate + Aurora + Redis + ALB).
#   2. Deletes the LangfuseDeletionStack itself.
#   3. Deletes the original LangfuseDeploymentStack (CodeBuild project + SNS topic).
#
# All data in Langfuse (traces, prompts, configs) is destroyed. There is no undo.
# After this finishes, remember to set "langfuseEnabled": false in packages/cdk/cdk.json
# and redeploy GenU if it was previously set to true.

set -eu

TEMPLATE_URL="https://aws-ml-jp.s3.ap-northeast-1.amazonaws.com/asset-deployments/LangfuseDeploymentStack.yaml"
DEPLOYMENT_STACK_NAME="LangfuseDeploymentStack"
DELETION_STACK_NAME="LangfuseDeletionStack"

PROFILE=""
REGION="ap-northeast-1"
EMAIL=""

usage() {
  echo "Usage: $0 --profile <aws-profile> --email <notification-email> [--region ap-northeast-1]"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
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

read -r -p "This will permanently delete the Langfuse server and ALL its data. Continue? [y/N] " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

echo "Creating $DELETION_STACK_NAME (ExecuteDelete=true) in $REGION (profile: $PROFILE)..."
aws cloudformation create-stack \
  --profile "$PROFILE" \
  --region "$REGION" \
  --stack-name "$DELETION_STACK_NAME" \
  --template-url "$TEMPLATE_URL" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=NotificationEmailAddress,ParameterValue="$EMAIL" \
    ParameterKey=ExecuteDelete,ParameterValue=true

echo "Waiting for $DELETION_STACK_NAME to reach CREATE_COMPLETE..."
aws cloudformation wait stack-create-complete \
  --profile "$PROFILE" --region "$REGION" --stack-name "$DELETION_STACK_NAME"

PROJECT=$(aws cloudformation describe-stacks \
  --profile "$PROFILE" --region "$REGION" --stack-name "$DELETION_STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='CodeBuildProjectName'].OutputValue" --output text)

echo "Waiting for CodeBuild project '$PROJECT' to finish destroying Langfuse infra..."

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
      echo "Error: Langfuse deletion build ended with status $STATUS"
      echo "Check CodeBuild logs for project '$PROJECT' for details, then clean up manually via the AWS console."
      exit 1
      ;;
  esac
  sleep 30
done

echo "Langfuse infra destroyed. Cleaning up wrapper stacks..."

aws cloudformation delete-stack \
  --profile "$PROFILE" --region "$REGION" --stack-name "$DELETION_STACK_NAME"
aws cloudformation wait stack-delete-complete \
  --profile "$PROFILE" --region "$REGION" --stack-name "$DELETION_STACK_NAME"

if aws cloudformation describe-stacks \
  --profile "$PROFILE" --region "$REGION" --stack-name "$DEPLOYMENT_STACK_NAME" &> /dev/null; then
  aws cloudformation delete-stack \
    --profile "$PROFILE" --region "$REGION" --stack-name "$DEPLOYMENT_STACK_NAME"
  aws cloudformation wait stack-delete-complete \
    --profile "$PROFILE" --region "$REGION" --stack-name "$DEPLOYMENT_STACK_NAME"
fi

echo ""
echo "Langfuse fully destroyed (infra + both wrapper stacks)."
echo "If packages/cdk/cdk.json has \"langfuseEnabled\": true, set it to false and run:"
echo "  npm run cdk:deploy -- --profile $PROFILE"
