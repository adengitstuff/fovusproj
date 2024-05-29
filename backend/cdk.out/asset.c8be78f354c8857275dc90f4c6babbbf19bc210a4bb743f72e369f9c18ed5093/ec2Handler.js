import { EC2Client, RunInstancesCommand, DescribeInstanceStatusCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { nanoid } from 'nanoid';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received DynamoDB stream event:', JSON.stringify(event, null, 2));
  const record = event.Records[0];

  if (record.eventName !== 'INSERT') {
    console.log('Event is not an INSERT, skipping...');
    return;
  }

  const newItem = unmarshall(record.dynamodb.NewImage);
  const { id, input_text, input_file_path } = newItem;

    // Log the values to ensure they are correct
    console.log('DynamoDB Record:', newItem);
    console.log('ID:', id);
    console.log('Input Text:', input_text);
    console.log('Input File Path:', input_file_path);
  
  
  let instanceId;

  try {
    // Step 1: Start the EC2 instance
    instanceId = await startEC2Instance();
    console.log('EC2 Instance started:', instanceId);

    // Step 2: Poll until the instance is ready
    await waitForInstanceInitialization(instanceId);
    console.log('EC2 Instance is ready.');

    // Step 3: Ensure SSM agent is installed and running
    await ensureSSMAgent(instanceId);
    console.log('SSM Agent ensured.');

    // Step 4: Run the script in the VM
    await runScriptInInstance(instanceId, id, input_text, input_file_path);
    console.log('Script run in the VM.');

    // Step 5: Terminate the EC2 instance
    await terminateEC2Instance(instanceId);
    console.log('EC2 Instance terminated.');
  } catch (error) {
    console.error('Error:', error);
    if (instanceId) {
      await terminateEC2Instance(instanceId);
      console.log('EC2 Instance terminated after error.');
    }
  }
};

const startEC2Instance = async () => {
  const params = {
    ImageId: 'ami-0ca2e925753ca2fb4', // Replace with your AMI ID
    InstanceType: 't2.micro',
    MinCount: 1,
    MaxCount: 1,
    IamInstanceProfile: { Name: 'ec2role' }, // Use the instance profile name here
    TagSpecifications: [{
      ResourceType: 'instance',
      Tags: [{ Key: 'Name', Value: 'auto-terminate-instance' }],
    }],
  };
  const data = await ec2Client.send(new RunInstancesCommand(params));
  return data.Instances[0].InstanceId;
};

const waitForInstanceInitialization = async (instanceId) => {
  const maxAttempts = 30;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getInstanceStatus(instanceId);
    if (status === 'ok') {
      return;
    }
    console.log(`Attempt ${attempt}: Instance not ready. Retrying in ${attempt * 1000}ms`);
    await delay(attempt * 1000); // Exponential backoff
  }

  throw new Error('EC2 instance did not become ready in time.');
};

const getInstanceStatus = async (instanceId) => {
  const params = {
    InstanceIds: [instanceId],
  };
  const result = await ec2Client.send(new DescribeInstanceStatusCommand(params));
  const instance = result.InstanceStatuses[0];

  if (instance && instance.InstanceState.Name === 'running' && instance.InstanceStatus.Status === 'ok' && instance.SystemStatus.Status === 'ok') {
    return 'ok';
  }
  return 'not ready';
};

const ensureSSMAgent = async (instanceId) => {
  const command = new SendCommandCommand({
    DocumentName: 'AWS-RunShellScript',
    InstanceIds: [instanceId],
    Parameters: {
      'commands': [
        'sudo yum install -y amazon-ssm-agent',
        'sudo systemctl enable amazon-ssm-agent',
        'sudo systemctl start amazon-ssm-agent'
      ]
    }
  });

  await ssmClient.send(command);
};

const runScriptInInstance = async (instanceId, id, inputText, inputFilePath) => {
    console.log('Downloading file from S3 with key:', inputFilePath);
  // Remove the bucket name from the key if it exists
  const bucketName = process.env.BUCKET_NAME;
  let inputkey = inputFilePath;
  if (inputFilePath.startsWith(`${bucketName}/`)) {
    inputkey = inputFilePath.substring(bucketName.length + 1);
  }
  
  console.log('Adjusted key for S3 GetObjectCommand:', inputkey);

  const s3GetObjectCommand = new GetObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: inputkey});
  const s3Object = await s3Client.send(s3GetObjectCommand);
  const inputFileContent = await streamToString(s3Object.Body);

  const outputFileContent = `${inputFileContent} : ${inputText.length}`;
  const outputFilePath = `${inputFilePath.replace('.input', '')}.output`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: outputFilePath,
    Body: outputFileContent,
  }));

  const updateItemCommand = new UpdateItemCommand({
    TableName: process.env.TABLE_NAME,
    Key: { id: { S: id } },
    UpdateExpression: 'SET output_file_path = :outputFilePath',
    ExpressionAttributeValues: {
      ':outputFilePath': { S: outputFilePath },
    },
  });

  await dynamoDBClient.send(updateItemCommand);
};

const terminateEC2Instance = async (instanceId) => {
  const params = {
    InstanceIds: [instanceId],
  };
  await ec2Client.send(new TerminateInstancesCommand(params));
};

const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
};
