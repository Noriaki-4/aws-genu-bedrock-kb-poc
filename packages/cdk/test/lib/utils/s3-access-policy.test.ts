import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { allowS3AccessWithSourceIpCondition } from '../../../lib/utils/s3-access-policy';

describe('allowS3AccessWithSourceIpCondition', () => {
  test('does not add an empty SourceIp condition', () => {
    const stack = new cdk.Stack();
    const role = new Role(stack, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    allowS3AccessWithSourceIpCondition('documents-bucket', role, 'read', {
      ipv4: [],
      ipv6: [],
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['s3:GetBucket*', 's3:GetObject*', 's3:List*'],
            Effect: 'Allow',
            Resource: [
              'arn:aws:s3:::documents-bucket',
              'arn:aws:s3:::documents-bucket/*',
            ],
            Condition: Match.absent(),
          }),
        ]),
      },
    });
  });

  test('adds a SourceIp condition when ranges are configured', () => {
    const stack = new cdk.Stack();
    const role = new Role(stack, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    allowS3AccessWithSourceIpCondition('documents-bucket', role, 'read', {
      ipv4: ['203.0.113.0/24'],
      ipv6: ['2001:db8::/32'],
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              IpAddress: {
                'aws:SourceIp': ['203.0.113.0/24', '2001:db8::/32'],
              },
            },
          }),
        ]),
      },
    });
  });
});
