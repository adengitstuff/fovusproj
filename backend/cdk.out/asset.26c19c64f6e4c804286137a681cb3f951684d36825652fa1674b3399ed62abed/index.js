const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/** Using SDK V3, this Lambda function should let the user
 * upload from the browser to the S3 bucket directly! It also shouldn't
 * touch the content of the file itself. 
 */
exports.handler = async (event) => {

  /** Use environment variables as per project spec to avoid
   * hardcoding
   */
  const bucketName = process.env.BUCKET_NAME;
  const { fileName } = event.queryStringParameters;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ url: presignedUrl }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
