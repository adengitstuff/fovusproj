import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2";
import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });


export const handler = async (event) => {
    for (const record of event.Records) {
        if (record.eventName === 'INSERT') {
            const fileName = record.dynamodb.NewImage.fileName.S;
            const s3Url = record.dynamodb.NewImage.s3Url.S;

            const instanceParams = {
                ImageId: 'ami-0123456789abcdef0', // Your AMI ID
                InstanceType: 't2.micro',
                KeyName: 'your-key-pair-name',
                MinCount: 1,
                MaxCount: 1,
                IamInstanceProfile: {
                    Name: 'your-iam-instance-profile',
                },
            };

            /** Try SSM instead of user data script to send commands to EC2 instance. I think
             * there were problems of the script running right on the EC2's startup.
             */
            try {
                const runInstancesCommand = new RunInstancesCommand(instanceParams);
                const instanceData = await ec2Client.send(runInstancesCommand);
                const instanceId = instanceData.Instances[0].InstanceId;

                const ssmParams = {
                    DocumentName: 'AWS-RunShellScript',
                    Parameters: {
                        commands: [
                            `aws s3 cp ${s3Url} /tmp/${fileName}`,
                            `node /tmp/your-processing-script.js /tmp/${fileName}`,
                            `aws s3 cp /tmp/processed-${fileName} s3://${process.env.BUCKET_NAME}/processed-${fileName}`,
                            `aws dynamodb update-item --table-name ${process.env.TABLE_NAME} --key '{"id": {"S": "${fileName}"}}' --update-expression "SET processed = :processed, processedFileUrl = :url" --expression-attribute-values '{":processed": {"BOOL": true}, ":url": {"S": "s3://${process.env.BUCKET_NAME}/processed-${fileName}"}}'`,
                            `sudo shutdown -h now`,
                        ],
                    },
                    InstanceIds: [instanceId],
                };

                const sendCommand = new SendCommandCommand(ssmParams);
                await ssmClient.send(sendCommand);
                console.log('SSM command sent successfully');
            } catch (err) {
                console.error('Error sending SSM command:', err);
            }
        }
    }
};
