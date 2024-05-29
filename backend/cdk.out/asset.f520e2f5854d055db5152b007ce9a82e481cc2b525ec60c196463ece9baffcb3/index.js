import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

/** This lambda handles generating the pre-signed URLs
 * to allow for S3 uploads directly from the browser, as per the 
 * Project spec.
 */
export const handler = async (event) => {

  /** Get bucket name from environment - I assumed this was okay as long as 
   * other credentials were not used.
  */
  const bucketName = process.env.BUCKET_NAME;
  const { fileName } = event.queryStringParameters;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });

  try {
    /** Call getSignedUrl to generate url!  */
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
