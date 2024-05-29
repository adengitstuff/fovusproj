import { EC2Client, RunInstancesCommand, DescribeInstanceStatusCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { nanoid } from 'nanoid';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  console.log('Received DynamoDB stream event:', JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') {
      console.log('Event is not an INSERT, skipping...');
      continue;
    }

    const newItem = unmarshall(record.dynamodb.NewImage);
    const { id, input_text, input_file_path } = newItem;

    console.log('DynamoDB Record:', newItem);
    console.log('ID:', id);
    console.log('Input Text:', input_text);
    console.log('Input File Path:', input_file_path);

    let instanceId;

    try {
      // Check if the file exists
      const fileExists = await checkIfFileExists(input_file_path);
      if (!fileExists) {
        console.error(`File does not exist: ${input_file_path}`);
        return;
      }

      // Check if the file is a script
      const isScript = await checkIfScript(input_file_path);
      if (!isScript) {
        console.error(`File is not a valid script: ${input_file_path}`);
        return;
      }

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

    } catch (error) {
      console.error('Error:', error);
    } finally {
      // Ensure the EC2 instance is terminated
      if (instanceId) {
        try {
          await terminateEC2Instance(instanceId);
          console.log('EC2 Instance terminated.');
        } catch (terminateError) {
          console.error('Error terminating EC2 instance:', terminateError);
        }
      }
    }
  }
};

const checkIfFileExists = async (key) => {
      // Remove the bucket name from the key if it exists
      const bucketName = process.env.BUCKET_NAME;
      let trimmedkey = key;
      if (key.startsWith(`${bucketName}/`)) {
        trimmedkey = key.substring(bucketName.length + 1);
      }
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: trimmedkey }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
};

const checkIfScript = async (key) => {
  const scriptExtensions = ['.sh', '.py', '.js']; // Add other script extensions if needed
  const extension = key.substring(key.lastIndexOf('.')).toLowerCase();
  return scriptExtensions.includes(extension);
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
  let inputKey = inputFilePath;
  if (inputFilePath.startsWith(`${bucketName}/`)) {
    inputKey = inputFilePath.substring(bucketName.length + 1);
  }

  console.log('Adjusted key for S3 GetObjectCommand:', inputKey);

  // Step 1: Download the input file from S3
  const s3GetObjectCommand = new GetObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: inputKey });
  const s3Object = await s3Client.send(s3GetObjectCommand);
  const inputFileContent = await streamToString(s3Object.Body);

  // Prepare the output file content
  const outputFileContent = `${inputFileContent} : ${inputText.length}`;

  // Create the commands to run in the EC2 instance
  const commands = [
    `echo "${inputFileContent}" > /home/ec2-user/inputfile.input`, // Save the file content
    `bash /home/ec2-user/inputfile.input`, // Execute the script (assuming it's a bash script)
    `echo "${outputFileContent}" > /home/ec2-user/outputfile${inputFilePath.substring(inputFilePath.lastIndexOf('.'))}` // Create the output file with appended length
  ];

  const ssmCommand = new SendCommandCommand({
    DocumentName: 'AWS-RunShellScript',
    InstanceIds: [instanceId],
    Parameters: {
      'commands': commands,
    },
  });

  await ssmClient.send(ssmCommand);

  // Step 2: Upload the output file to S3
  const outputFilePath = inputKey.replace('.input', '.output');

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: outputFilePath,
    Body: outputFileContent, // Combine input file content and text length for output
  }));

  // Step 3: Update DynamoDB with the output file path
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
