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

/** This class uses SSM to run scripts on EC2 instances, and it creates EC2 instances
 * on the fly as per the project spec. Each EC2 instance should terminate automatically. This should
 * be triggered by a dynamoDB stream event, and then parse through records to only respond to
 * inserts. Then, it should fulfill requirements of project spec and terminate. 
 * 
 */
export const handler = async (event) => {
  console.log('Received DynamoDB stream event:', JSON.stringify(event, null, 2));
  
  /** Parse through records - this was important to not create
   * other EC2 instances in case there are retries
   */
  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') {
      console.log('Event is not an INSERT, skipping...');
      continue;
    }

    /** Parse new item */
    const newItem = unmarshall(record.dynamodb.NewImage);
    const { id, input_text, input_file_path } = newItem;

    /** Heavy logging while testing: 
    console.log('DynamoDB Record:', newItem);
    console.log('ID:', id);
    console.log('Input Text:', input_text);
    console.log('Input File Path:', input_file_path);*/

    let instanceId;

    try {
      /** Check that the file exist\ */
      const fileExists = await checkIfFileExists(input_file_path);
      if (!fileExists) {
        console.error(`File does not exist: ${input_file_path}`);
        return;
      }

      /** Check extension to handle non-script cases */
      const isScript = await checkIfScript(input_file_path);
      if (!isScript) {
        console.error(`File is not a valid script: ${input_file_path}`);
        return;
      }

      /** Start EC2 Instance! */
      instanceId = await startEC2Instance();
      //console.log('EC2 Instance started:', instanceId);

      /** An interesting challenge was the time it takes for an EC2 instance to simply
       * run and initialize; I thought of querying it until it was initialized successfully.
       */
      await waitForInstanceInitialization(instanceId);
      //console.log('EC2 Instance is ready.');

      /** Get the SSM environment ready */
      await ensureSSMAgent(instanceId);
      console.log('SSM Agent ensured.');

      /** Run the script that was downloaded, and handle file appending and outputs */
      await runScriptInInstance(instanceId, id, input_text, input_file_path);
      console.log('Script run in the VM.');

    } catch (error) {
      console.error('Error:', error);
    } finally {
      /** Make sure ec2 instance is terminated... */
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

/** Trim key and check if the file exists in S3 */
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

/** I wanted to ensure that it was a script for essential error handling, as per the project spec.
 * I just use a simple set of extensions for now but any can be added. 
 */
const checkIfScript = async (key) => {
  const scriptExtensions = ['.sh', '.py', '.js']; 
  const extension = key.substring(key.lastIndexOf('.')).toLowerCase();
  return scriptExtensions.includes(extension);
};

/** Method to actually start the EC2 instance using runinstancescommand. */
const startEC2Instance = async () => {
  const params = {
    ImageId: 'ami-0ca2e925753ca2fb4', // Replace with your AMI ID
    InstanceType: 't2.micro',
    MinCount: 1,
    MaxCount: 1,
    IamInstanceProfile: { Name: 'ec2role' }, // Use the instance profile name here
    TagSpecifications: [{
      ResourceType: 'instance',
      Tags: [{ Key: 'Name', 
      Value: 'auto-terminate-instance' }],
    }],
  };
  const data = await ec2Client.send(new RunInstancesCommand(params));
  return data.Instances[0].InstanceId;
};

/** EC2 instance is stuck in "initializing" for several minutes sometimes. This just sets up a wait
 * with exponential backoff for it to be ready.
 */
const waitForInstanceInitialization = async (instanceId) => {
  const maxAttempts = 30;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getInstanceStatus(instanceId);
    if (status === 'ok') {
      return;
    }
    //console.log(`Attempt ${attempt}: Instance not ready. Retrying in ${attempt * 1000}ms`);
    await delay(attempt * 1000); 
  }

  throw new Error('EC2 instance did not become ready in time.');
};

/** Retrieve status */
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

/** Have to actually install the ssm agent! */
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

/** Complete project requirements, reading the content (converting to string) and
 * then appending the count in input text. I wasn't entirely sure if there was a literal
 * .output file intended, but I chose .output simply to differentiate between input and output
 * visually easier.
 */
const runScriptInInstance = async (instanceId, id, inputText, inputFilePath) => {
  //console.log('Downloading file from S3 with key:', inputFilePath);

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

  // Extract the file extension and create the output file path with .output extension
  const originalExtension = inputKey.substring(inputKey.lastIndexOf('.'));
  // Full output file path, to modify dynamoDB FileTable
  const outputFilePath = `${bucketName}/${inputKey.replace(originalExtension, '.output')}`;

  // Log the output file path for debugging
  console.log('Output File Path:', outputFilePath);

  // Create the SSM commands that we can run in the EC2 instance
  const commands = [
    `echo "${inputFileContent}" > /home/ec2-user/inputfile${originalExtension}`, // Save the file content
    `bash /home/ec2-user/inputfile${originalExtension}`, // Execute bash script
    `echo "${outputFileContent}" > /home/ec2-user/outputfile.output` // append length
  ];

  /** Create ssm SendCommand */
  const ssmCommand = new SendCommandCommand({
    DocumentName: 'AWS-RunShellScript',
    InstanceIds: [instanceId],
    Parameters: {
      'commands': commands,
    },
  });

  await ssmClient.send(ssmCommand);

  /** PutObject to upload the new file, with text count appended */
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: outputFilePath,
    Body: outputFileContent, 
  }));

  /** Put new column, output_file_path, into dynamoDB Table. This triggers
   * a new event in the stream but it is ignored by the Lambda because it is a 
   * modify event.
   */
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

/** Terminate */
const terminateEC2Instance = async (instanceId) => {
  const params = {
    InstanceIds: [instanceId],
  };
  await ec2Client.send(new TerminateInstancesCommand(params));
};

/** I believe in typescript there is a streamtostring method but
 * in V3 SDK there wasn't. Body from GetObject returns a readable stream
 * so manually turn it into string
 */
const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
};
