const { EC2Client, RunInstancesCommand, TerminateInstancesCommand } = require('@aws-sdk/client-ec2');
const { IAMClient, GetRoleCommand } = require('@aws-sdk/client-iam');

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event));

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const roleData = await iamClient.send(new GetRoleCommand({ RoleName: process.env.EC2_ROLE_NAME }));
      const roleArn = roleData.Role.Arn;

      const params = {
        ImageId: 'ami-0abcdef1234567890', // Replace with your AMI ID
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
        IamInstanceProfile: { Arn: roleArn },
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
