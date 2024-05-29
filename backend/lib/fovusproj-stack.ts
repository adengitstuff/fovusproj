import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

/** Project stack that creates a bucket. I use pre-signed URL's to adhere to the project
 * spec, in that the input file should be uploaded directly from the browser. 
 */
export class FovusprojStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'fovusstorage', {
      bucketName: `fovusstorage`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      //enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      publicReadAccess: false,
    });


    const presignUrlFunction = new lambda.Function(this, 'PresignUrlFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    /** Define lambda policies and allow all resources for now (only the ones used are enabled) */
    const lambdaIam = new iam.Policy(this, 'LambdaS3DynamoPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: [
            's3:PutObject',
            's3:GetObject',
            's3:ListBucket',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:GetItem',
            'ec2:RunInstances',
            'ec2:DescribeInstances',
            'ec2:TerminateInstances',
            'ec2:DescribeInstanceStatus',
            'iam:PassRole',  // Pass role! Didn't know I could do this
            'iam:GetRole',
            'ec2:CreateTags', 
          ],
          resources: [
            //bucket.bucketArn,
            //`${bucket.bucketArn}/*`, 
            //`arn:aws:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:instance/*`,  // Allow all ec2 instances
            '*'
          ],
        }),
      ],
    });

    /** Lambda execution role */
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'),
      ],
    });

    presignUrlFunction.role?.attachInlinePolicy(lambdaIam);

    /* Incoming HTTP requests are handled by this API Gateway object. I planned on using
    Cognito instead of CORS but this turned out to be faster for now. In a production setting,
    I would use Cognito for sure!
    */
    const api = new apigateway.RestApi(this, 'FileApi', {
      restApiName: 'File Service',
      description: 'This service handles file uploads.',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS, // Allow all HTTP methods
        allowHeaders: ['*'],
      },
      // leave default failOnWarnings for now
      failOnWarnings: false,
    });

    /** Set up an integration to the lambda function & attach to api gateway */
    const presignUrlIntegration = new apigateway.LambdaIntegration(presignUrlFunction);
    const presignUrlResource = api.root.addResource('generate-presigned-url');
    presignUrlResource.addMethod('GET', presignUrlIntegration);
   
    /** Add dynamoDB table. Enable streams in order 
     * to automatically create new EC2 instances.*/
    const table = new dynamodb.Table(this, 'FovusTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING}, // Note that nanoid ID is string, not a number
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    }
    );

    /** Lambda function to add to dynamoDB table after S3 upload */
    const addToTableFunction = new lambda.Function(this, 'addToTableFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'addTable.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
      },
    });
    
    /** Attach policies, not all needed */
    addToTableFunction.role?.attachInlinePolicy(lambdaIam); 
    table.grantReadWriteData(addToTableFunction);

    /** Add event source, I used LATEST instead of TRIM_HORIZON here. 
     * Arbitrary batch size, might be a better batch size. 
     */
    addToTableFunction.addEventSource(new DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 5, 
    }));

    /** Integrate and attach addToTable lambdas: */
    const addToTableFunctionIntegration = new apigateway.LambdaIntegration(addToTableFunction);
    const addToTableResource = api.root.addResource('add-table');
    addToTableResource.addMethod('POST', addToTableFunctionIntegration);
    

    /** EC2 Role for s3 and dynamo access*/
    const ec2Iam = new iam.Role(this, 'Ec2InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
      ],
    }
  );

    /** Made ec instance profiles at first*/
    const instanceProfile = new iam.CfnInstanceProfile(this, 'Ec2InstanceProfile', {
      roles: [lambdaRole.roleName],
      instanceProfileName: 'Ec2InstanceProfile',
    }
  );

    const ec2CreationFunction = new lambda.Function(this, 'ec2CreationFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'ec2Handler.handler',
      code: lambda.Code.fromAsset('lambda'),
      role: lambdaRole,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
        EC2_INSTANCE_PROFILE_ARN: instanceProfile.attrArn,
      },
      /** Set longer timeout to account for wait for server */
      timeout: cdk.Duration.minutes(5)  // Set timeout to 5 minutes
    });

    ec2CreationFunction.role?.attachInlinePolicy(lambdaIam);
    table.grantReadWriteData(ec2CreationFunction);


    ec2CreationFunction.addEventSource(new DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1,
    }));


  }
}
