import { EC2Client, RunInstancesCommand } from '@aws-sdk/client-ec2';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const dynamoDbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received DynamoDB Stream event:', JSON.stringify(event));

  for (const record of event.Records) {
    console.log('Processing record:', JSON.stringify(record));
    if (record.eventName === 'INSERT') {
      try {
        const newItem = record.dynamodb.NewImage;
        const id = newItem.id.S;
        const inputFilePath = newItem.input_file_path.S;
        const inputText = newItem.input_text.S;

        const instanceProfileArn = process.env.EC2_INSTANCE_PROFILE_ARN;
        const bucketName = process.env.BUCKET_NAME;
        const tableName = process.env.TABLE_NAME;

        const userDataScript = `#!/bin/bash
        exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
        echo "Starting user data script"
        yum update -y
        yum install -y aws-cli jq
        input_text="${inputText}"
        input_file_path="s3://${bucketName}/${inputFilePath}"
        aws s3 cp \${input_file_path} /home/ec2-user/input_script.sh
        file_type=$(file --mime-type -b /home/ec2-user/input_script.sh)
        if [[ "\$file_type" == "text/x-shellscript" ]]; then
          if ! bash /home/ec2-user/input_script.sh; then
            exit 1
          fi
        else
          exit 1
        fi
        file_content=$(cat /home/ec2-user/input_script.sh)
        text_length=\${#input_text}
        echo "\${file_content} : \${text_length}" > /home/ec2-user/output.txt
        output_file_path="s3://${bucketName}/${id}.output"
        aws s3 cp /home/ec2-user/output.txt \${output_file_path}
        aws dynamodb update-item --table-name ${tableName} --key '{"id": {"S": "${id}"}}' --update-expression "SET output_file_path = :path" --expression-attribute-values '{":path": {"S": "\${output_file_path}"}}'
        shutdown -h now`;

        const params = {
          ImageId: 'ami-0ca2e925753ca2fb4',
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

        const data = await ec2Client.send(new RunInstancesCommand(params));
        console.log('EC2 instance created successfully:', data);
        const instanceId = data.Instances[0].InstanceId;

        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'EC2 instance created', instanceId }),
        };
      } catch (error) {
        console.error('Error processing record:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }
    }
  }
};
