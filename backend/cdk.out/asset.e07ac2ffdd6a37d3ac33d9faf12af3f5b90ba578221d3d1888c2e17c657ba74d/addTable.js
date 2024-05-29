import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { nanoid } from 'nanoid';


const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

/** Export: */

exports.handler = async (event) => {

    const tableName = process.env.TABLE_NAME;

    if (!event.body) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              },
            body: JSON.stringify({error: 'Missing event'}),
        };
    }
    
    const body = JSON.parse(event.body);
    const inputText = body.inputText; 
    const fileName = body.fileName;    
    const id = nanoid();

    const tableEntry = {
        TableName: tableName,
        Item: {
                id: { S: id},
                input_text: { S: inputText },
                input_file_path: { S: `${process.env.BUCKET_NAME}/${fileName}`},
        },
    };

    try {
        await dynamoClient.sent(new PutItemCommand(tableEntry));
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              },
            body: JSON.stringify({message: 'Saved to dynamo successfully', id}),
        }
    } catch(error) {
        console.log('error in putting into table: ' + error.message);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              },
            body: JSON.stringify({ error: errormessage }),
        };
    }
};
