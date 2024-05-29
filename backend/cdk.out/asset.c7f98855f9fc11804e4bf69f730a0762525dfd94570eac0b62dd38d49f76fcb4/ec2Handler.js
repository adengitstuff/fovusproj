import { EC2Client, RunInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { IAMClient, GetRoleCommand } from '@aws-sdk/client-iam';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event));

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const newItem = record.dynamodb.NewImage;
      const id = newItem.id.S;
      const inputFilePath = newItem.input_file_path.S;
      const inputText = newItem.input_text.S;

      const instanceProfileArn = process.env.EC2_INSTANCE_PROFILE_ARN;
      const scriptBucketName = process.env.SCRIPT_BUCKET_NAME;
      const bucketName = process.env.BUCKET_NAME;

      const userDataScript = `#!/bin/bash
      # Install AWS CLI
      yum install -y aws-cli

      # Download the script from S3
      aws s3 cp s3://${bucketName}/${inputFilePath} /home/ec2-user/input_script.sh

      # Run the script
      bash /home/ec2-user/input_script.sh

      # Read the input file and append the length of the input text
      input_text=$(cat /home/ec2-user/input_script.sh)
      input_length=${#input_text}
      echo "$input_text : $input_length" > /home/ec2-user/output.txt

      # Upload the output file to S3
      aws s3 cp /home/ec2-user/output.txt s3://${bucketName}/${id}.output

      # Update DynamoDB with the output file path
      aws dynamodb update-item --table-name ${process.env.TABLE_NAME} --key '{"id": {"S": "${id}"}}' --update-expression "SET output_file_path = :path" --expression-attribute-values '{":path": {"S": "${bucketName}/${id}.output"}}'

      # Shutdown the instance
      shutdown -h now`;

      const params = {
        ImageId: 'ami-0ca2e925753ca2fb4', // Replace with your valid AMI ID
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
        IamInstanceProfile: { Arn: instanceProfileArn },
        UserData: Buffer.from(userDataScript).toString('base64'),
        TagSpecifications: [{
          ResourceType: 'instance',
          Tags: [{ Key: 'Name', Value: 'auto-terminate-instance' }],
        }],
      };

      try {
        const data = await ec2Client.send(new RunInstancesCommand(params));
        console.log('EC2 instance created successfully:', data);

        const instanceId = data.Instances[0].InstanceId;
        console.log(`Terminating instance: ${instanceId}`);
        await ec2Client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
        console.log('past await');
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
