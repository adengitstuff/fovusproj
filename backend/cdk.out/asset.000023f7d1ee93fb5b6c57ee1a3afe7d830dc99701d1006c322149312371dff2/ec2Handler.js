import { EC2Client, RunInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { IAMClient, GetRoleCommand }from '@aws-sdk/client-iam';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event));

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
        const instanceProfileArn = process.env.EC2_INSTANCE_PROFILE_ARN;

      const params = {
        ImageId: 'ami-0ca2e925753ca2fb4', // taken from an amazon public ami. source: amazon/al2023-ami-2023.4.20240528.0-kernel-6.1-x86_64
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
        IamInstanceProfile: { Arn: instanceProfileArn },
        UserData: Buffer.from('#!/bin/bash\nshutdown -h now').toString('base64'),
        TagSpecifications: [{
          ResourceType: 'instance',
          Tags: [{ Key: 'Name', Value: 'auto-terminate-instance' }],
        }],
      };

      try {
        const data = await ec2Client.send(new RunInstancesCommand(params));
        console.log('EC2 instance created successfully:', data);

        const instanceId = data.Instances[0].InstanceId;
        console.log(`Terminating instance ${instanceId}`);
        await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));

        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'EC2 instance created and terminated', instanceId }),
        };
      } catch (error) {
        console.error('Error creating or terminating EC2 instance:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }
    }
  }
};
