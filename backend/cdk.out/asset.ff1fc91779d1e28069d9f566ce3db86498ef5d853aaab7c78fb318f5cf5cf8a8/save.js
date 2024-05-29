const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { nanoid } = require('nanoid');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  const tableName = process.env.TABLE_NAME;
  const { inputText, fileName } = JSON.parse(event.body);
  const id = nanoid();

  const params = {
    TableName: tableName,
    Item: {
      id: { S: id },
      input_text: { S: inputText },
      input_file_path: { S: `${process.env.BUCKET_NAME}/${fileName}` },
    },
  };

  try {
    await dynamoClient.send(new PutItemCommand(params));
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ message: 'Data saved successfully', id }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
