import { EC2Client, RunInstancesCommand, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const handler = async (event) => {
    console.log('Received DynamoDB Stream event:', JSON.stringify(event));

    for (const record of event.Records) {
        console.log('Processing record:', JSON.stringify(record));
        if (record.eventName === 'INSERT') {
            try {
                const newItem = record.dynamodb.NewImage;

                if (!newItem.id || !newItem.input_text || !newItem.input_file_path) {
                    console.error('Missing expected attributes in DynamoDB record:', JSON.stringify(newItem));
                    continue;
                }

                const id = newItem.id.S;
                const inputText = newItem.input_text.S;
                const inputFilePath = newItem.input_file_path.S;

                const instanceProfileArn = process.env.EC2_INSTANCE_PROFILE_ARN;
                const bucketName = process.env.BUCKET_NAME;
                const tableName = process.env.TABLE_NAME;

                const instanceParams = {
                    ImageId: 'ami-0ca2e925753ca2fb4', 
                    InstanceType: 't2.micro',
                    MinCount: 1,
                    MaxCount: 1,
                    IamInstanceProfile: { Arn: instanceProfileArn },
                    TagSpecifications: [{
                        ResourceType: 'instance',
                        Tags: [{ Key: 'Name', Value: 'auto-terminate-instance' }],
                    }],
                };

                const runInstancesCommand = new RunInstancesCommand(instanceParams);
                const instanceData = await ec2Client.send(runInstancesCommand);
                const instanceId = instanceData.Instances[0].InstanceId;

                console.log(`EC2 instance ${instanceId} created, waiting for it to be in 'running' state`);

                await delay(15000); // Hacky solution for the delay it takes to start an ec2 server up.

                const ssmParams = {
                    DocumentName: 'AWS-RunShellScript',
                    Parameters: {
                        commands: [
                            `aws s3 cp s3://${inputFilePath} /tmp/input_file.input`,
                            `if [ -f /tmp/input_file.input ]; then`,
                            `  file_content=$(cat /tmp/input_file.input);`,
                            `  text_length=${inputText.length};`,
                            `  echo "$file_content : $text_length" > /tmp/output_file.output;`,
                            `  aws s3 cp /tmp/output_file.output s3://${bucketName}/output_file.output;`,
                            `  aws dynamodb update-item --table-name ${tableName} --key '{"id": {"S": "${id}"}}' --update-expression "SET output_file_path = :path" --expression-attribute-values '{":path": {"S": "s3://${bucketName}/output_file.output"}}';`,
                            `else`,
                            `  echo "Failed to download the script";`,
                            `fi`,
                            `sudo shutdown -h now`
                        ]
                    },
                    InstanceIds: [instanceId],
                };

                const sendCommand = new SendCommandCommand(ssmParams);
                await ssmClient.send(sendCommand);
                console.log('SSM command sent successfully');

                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'EC2 instance created and command sent', instanceId }),
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
