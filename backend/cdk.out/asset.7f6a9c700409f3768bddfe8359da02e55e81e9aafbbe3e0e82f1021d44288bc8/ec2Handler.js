import { EC2Client, RunInstancesCommand } from '@aws-sdk/client-ec2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event));

  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const newItem = record.dynamodb.NewImage;
      const id = newItem.id.S;
      const inputFilePath = newItem.input_file_path.S;
      const inputText = newItem.input_text.S;

      const instanceProfileArn = process.env.EC2_INSTANCE_PROFILE_ARN;
      const bucketName = process.env.BUCKET_NAME;

      const userDataScript = `#!/bin/bash
      set -e

      exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

      echo "Starting user data script"

      yum update -y
      yum install -y aws-cli jq

      echo "Fetching input file and text from DynamoDB"
      input_text="${inputText}"
      input_file_path="s3://${bucketName}/${inputFilePath}"

      echo "Downloading the script from S3"
      aws s3 cp ${inputFilePath} /home/ec2-user/input_script.sh

      echo "Running the script"
      if ! bash /home/ec2-user/input_script.sh; then
        echo "Script execution failed"
        exit 1
      fi

      echo "Appending input text length to the file content"
      file_content=$(cat /home/ec2-user/input_script.sh)
      text_length=\${#input_text}
      echo "\${file_content} : \${text_length}" > /home/ec2-user/output.txt

      echo "Uploading the output file to S3"
      output_file_path="s3://${bucketName}/${id}.output"
      if ! aws s3 cp /home/ec2-user/output.txt \${output_file_path}; then
        echo "Failed to upload output file to S3"
        exit 1
      fi

      echo "Updating DynamoDB with the output file path"
      if ! aws dynamodb update-item --table-name ${process.env.TABLE_NAME} --key '{"id": {"S": "${id}"}}' --update-expression "SET output_file_path = :path" --expression-attribute-values '{":path": {"S": "\${output_file_path}"}}'; then
        echo "Failed to update DynamoDB"
        exit 1
      fi

      echo "Shutting down the instance"
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

        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'EC2 instance created', instanceId }),
        };
      } catch (error) {
        console.error('Error creating EC2 instance:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }
    }
  }
};
