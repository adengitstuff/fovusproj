import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { nanoid } from 'nanoid';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
/** This handler was for adding an entry to the DynamoDB File Table. 
 * I assume that getting tablename from environment is okay. Parse the table
 * info and generate a random id with nanoid.
 */
export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event));

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
    
    /** Parse and create ID! */
    const body = JSON.parse(event.body);
    const inputText = body.inputText; 
    const fileName = body.fileName;    
    const id = nanoid();

    /** Simple table entry */
    const tableEntry = {
        TableName: tableName,
        Item: {
                id: { S: id},
                input_text: { S: inputText },
                input_file_path: { S: `${process.env.BUCKET_NAME}/${fileName}`},
        },
    };

    /** Call putItem and log errors, trying to be verbose. */
    try {
        await dynamoClient.send(new PutItemCommand(tableEntry));
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
        console.log('Error in putting entry into table: ' + error.message);
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
